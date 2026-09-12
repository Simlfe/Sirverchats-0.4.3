import 'dart:async';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';

import '../../data/api_client.dart';
import '../../data/local_database.dart';
import '../../data/realtime_client.dart';
import '../../core/message_pagination.dart';
import '../../models/models.dart';

class ConversationViewState {
  ConversationViewState({required this.ref});

  final ConversationRef ref;
  List<Message> messages = const [];
  MessageCursor? nextCursor;
  bool hasMoreRemote = true;
  int visibleCount = 0;
  String draft = '';
  double scrollOffset = 0;
  bool hydrated = false;
  bool loading = false;
  bool loadingOlder = false;
  String? error;

  List<Message> get visibleMessages {
    if (messages.isEmpty) return const [];
    final start = (messages.length - visibleCount.clamp(0, messages.length))
        .clamp(0, messages.length);
    return messages.sublist(start);
  }

  bool get hasMoreCached => visibleCount < messages.length;
  bool get canLoadOlder => hasMoreCached || hasMoreRemote;
}

class ChatController extends ChangeNotifier {
  ChatController({
    required this.api,
    required this.database,
    required this.realtime,
  }) {
    _realtimeSubscription = realtime.events.listen(_onRealtimeEvent);
  }

  final ApiClient api;
  final AppDatabase database;
  final RealtimeClient realtime;
  final Map<String, ConversationViewState> _states = {};
  final Map<String, int> _generations = {};
  final Map<String, CancelToken> _cancelTokens = {};
  StreamSubscription<RealtimeEvent>? _realtimeSubscription;
  ConversationRef? activeConversation;
  List<Server> servers = const [];
  final Map<String, List<Channel>> channelsByServer = {};
  List<ConversationRef> dms = const [];
  bool loadingNavigation = false;
  String? navigationError;

  ConversationViewState stateFor(ConversationRef ref) {
    return _states.putIfAbsent(ref.key, () => ConversationViewState(ref: ref));
  }

  Future<void> initialize() async {
    final session = api.session ?? await api.restoreSession();
    if (session == null) return;
    await Future.wait([
      _loadNavigation(),
      realtime.connect(token: session.accessToken),
    ]);
    realtime.updateSubscriptions(_subscriptionConversations());
  }

  Future<void> resetSession() async {
    for (final token in _cancelTokens.values) {
      token.cancel('session reset');
    }
    _cancelTokens.clear();
    _states.clear();
    _generations.clear();
    activeConversation = null;
    servers = const [];
    channelsByServer.clear();
    dms = const [];
    await database.clearAll();
    notifyListeners();
  }

  Future<void> _loadNavigation() async {
    loadingNavigation = true;
    navigationError = null;
    notifyListeners();
    try {
      final loadedServers = await api.listServers();
      servers = loadedServers;
      await Future.wait(
        loadedServers.map((server) async {
          try {
            channelsByServer[server.id] = await api.listChannels(server.id);
          } on ApiException {
            channelsByServer[server.id] = const [];
          }
        }),
      );
      dms = await api.listDms();
      final firstChannel = loadedServers
          .expand((server) => channelsByServer[server.id] ?? const <Channel>[])
          .cast<Channel?>()
          .firstWhere((channel) => channel != null, orElse: () => null);
      if (activeConversation == null && firstChannel != null) {
        await openConversation(
          ConversationRef(kind: ConversationKind.channel, id: firstChannel.id),
        );
      }
    } on ApiException catch (error) {
      navigationError = error.message;
    } finally {
      loadingNavigation = false;
      notifyListeners();
    }
  }

  Future<void> openConversation(ConversationRef ref) async {
    final previous = activeConversation;
    if (previous?.key != ref.key) {
      _cancelTokens[previous?.key]?.cancel('conversation changed');
    }
    activeConversation = ref;
    final state = stateFor(ref);
    final generation = (_generations[ref.key] ?? 0) + 1;
    _generations[ref.key] = generation;
    state.error = null;
    notifyListeners();

    if (!state.hydrated) {
      final snapshot = await database.readConversation(ref);
      if (!_isCurrent(ref, generation)) return;
      if (snapshot != null) {
        state.messages = mergeMessages(snapshot.messages);
        state.nextCursor = snapshot.cursor;
        state.hasMoreRemote = snapshot.hasMore;
        state.visibleCount = snapshot.visibleCount == 0
            ? state.messages.length.clamp(0, 30)
            : snapshot.visibleCount.clamp(0, state.messages.length);
        state.draft = snapshot.draft;
        state.scrollOffset = snapshot.scrollOffset;
      }
      state.hydrated = true;
      notifyListeners();
    }

    await _refreshLatest(ref, generation);
    realtime.updateSubscriptions(_subscriptionConversations());
  }

  /// Keep one authenticated socket subscribed to every conversation the user
  /// can navigate to. This is intentionally derived from the already-loaded
  /// navigation data, so incoming messages and call invites are not lost just
  /// because the recipient is currently viewing a different DM or channel.
  Iterable<ConversationRef> _subscriptionConversations() sync* {
    final seen = <String>{};
    for (final channels in channelsByServer.values) {
      for (final channel in channels) {
        final ref = ConversationRef(
          kind: ConversationKind.channel,
          id: channel.id,
        );
        if (seen.add(ref.key)) yield ref;
      }
    }
    for (final dm in dms) {
      if (seen.add(dm.key)) yield dm;
    }
  }

  Future<void> _refreshLatest(ConversationRef ref, int generation) async {
    final state = stateFor(ref);
    if (state.loading) {
      // A repeated navigation/retry for the same conversation supersedes the
      // old request. Without cancelling it, the old generation can leave the
      // shared loading flag stuck forever while the newer request is ignored.
      _cancelTokens[ref.key]?.cancel('refresh superseded');
    }
    state.loading = true;
    notifyListeners();
    final token = CancelToken();
    _cancelTokens[ref.key] = token;
    try {
      final page = await api.fetchMessages(ref, limit: 30, cancelToken: token);
      if (!_isCurrent(ref, generation)) return;
      final hadMessages = state.messages.isNotEmpty;
      state.messages = mergeMessages([...state.messages, ...page.items]);
      state.nextCursor = page.nextCursor;
      state.hasMoreRemote = page.hasMore;
      state.visibleCount = hadMessages
          ? state.visibleCount.clamp(0, state.messages.length)
          : page.items.length.clamp(0, state.messages.length);
      await database.writeMessages(ref, page.items);
      await database.writeState(
        ref,
        cursor: page.nextCursor,
        updateCursor: true,
        hasMore: page.hasMore,
        visibleCount: state.visibleCount,
        draft: state.draft,
        scrollOffset: state.scrollOffset,
      );
    } on ApiException catch (error) {
      if (error.cause is! DioException ||
          (error.cause as DioException).type != DioExceptionType.cancel) {
        state.error = error.message;
      }
    } finally {
      if (_generations[ref.key] == generation) {
        state.loading = false;
        notifyListeners();
      }
      if (identical(_cancelTokens[ref.key], token)) {
        _cancelTokens.remove(ref.key);
      }
    }
  }

  Future<void> loadOlder(ConversationRef ref) async {
    final state = stateFor(ref);
    if (state.loadingOlder || !state.canLoadOlder) return;
    state.loadingOlder = true;
    notifyListeners();

    // Reveal locally cached pages before asking the server for anything. This
    // deliberately ignores hasMoreRemote: cached history remains available.
    if (state.hasMoreCached) {
      state.visibleCount = (state.visibleCount + 50).clamp(
        0,
        state.messages.length,
      );
      await database.writeState(
        ref,
        hasMore: state.hasMoreRemote,
        visibleCount: state.visibleCount,
        draft: state.draft,
        scrollOffset: state.scrollOffset,
      );
      state.loadingOlder = false;
      notifyListeners();
      return;
    }

    // The active window may already contain 500 items even though older
    // pages are still in IndexedDB/SQLite. Reveal those pages before hitting
    // the network; the remote cursor remains independent of cache eviction.
    final oldest = state.messages.isEmpty ? null : state.messages.first.cursor;
    if (oldest != null) {
      final generation = _generations[ref.key] ?? 0;
      List<Message> cachedOlder = const [];
      try {
        cachedOlder = await database.readMessagesBefore(ref, oldest);
      } catch (_) {
        // A cache read failure should never prevent the remote cursor from
        // continuing; the next successful page repairs the local cache.
      }
      if (!_isCurrent(ref, generation)) {
        state.loadingOlder = false;
        notifyListeners();
        return;
      }
      if (cachedOlder.isNotEmpty) {
        state.messages = mergeMessages([
          ...cachedOlder,
          ...state.messages,
        ], keepNewest: false);
        state.visibleCount = (state.visibleCount + cachedOlder.length).clamp(
          0,
          state.messages.length,
        );
        await database.writeState(
          ref,
          hasMore: state.hasMoreRemote,
          visibleCount: state.visibleCount,
          draft: state.draft,
          scrollOffset: state.scrollOffset,
        );
        state.loadingOlder = false;
        notifyListeners();
        return;
      }
    }

    if (!state.hasMoreRemote || state.nextCursor == null) {
      state.loadingOlder = false;
      notifyListeners();
      return;
    }

    final generation = _generations[ref.key] ?? 0;
    final token = CancelToken();
    _cancelTokens[ref.key] = token;
    try {
      final page = await api.fetchMessages(
        ref,
        limit: 50,
        before: state.nextCursor,
        cancelToken: token,
      );
      if (!_isCurrent(ref, generation)) return;
      // While scrolling upward the 500-item active window follows the
      // viewport toward older history. Keeping the oldest side here prevents
      // each successful page from being immediately discarded as "too old";
      // the cache still retains every fetched page for later navigation.
      state.messages = mergeMessages([
        ...state.messages,
        ...page.items,
      ], keepNewest: false);
      state.visibleCount = (state.visibleCount + page.items.length).clamp(
        0,
        state.messages.length,
      );
      state.nextCursor = page.nextCursor;
      state.hasMoreRemote = page.hasMore;
      await database.writeMessages(ref, page.items);
      await database.writeState(
        ref,
        cursor: page.nextCursor,
        updateCursor: true,
        hasMore: page.hasMore,
        visibleCount: state.visibleCount,
        draft: state.draft,
        scrollOffset: state.scrollOffset,
      );
    } on ApiException catch (error) {
      state.error = error.message;
    } finally {
      if (identical(_cancelTokens[ref.key], token)) {
        _cancelTokens.remove(ref.key);
      }
      state.loadingOlder = false;
      notifyListeners();
    }
  }

  Future<void> send(String content, {String? replyTo}) async {
    final ref = activeConversation;
    if (ref == null || content.trim().isEmpty) return;
    final state = stateFor(ref);
    final optimisticId = 'pending-${DateTime.now().microsecondsSinceEpoch}';
    final pending = Message(
      id: optimisticId,
      conversation: ref,
      content: content.trim(),
      senderId: api.session?.user.id ?? '',
      created: DateTime.now().toUtc(),
      sender: api.session?.user,
      replyTo: replyTo,
      pending: true,
    );
    state.messages = mergeMessages([...state.messages, pending]);
    state.visibleCount = state.messages.length;
    notifyListeners();
    try {
      final message = await api.sendMessage(
        ref,
        content.trim(),
        replyTo: replyTo,
      );
      state.messages = mergeMessages([
        ...state.messages.where((item) => item.id != optimisticId),
        message,
      ]);
      await database.writeMessages(ref, [message]);
    } on ApiException catch (error) {
      state.messages = state.messages
          .where((item) => item.id != optimisticId)
          .toList(growable: false);
      state.error = error.message;
    }
    await _persistState(ref);
    notifyListeners();
  }

  Future<void> sendAttachment(PlatformFile file, {String caption = ''}) async {
    final ref = activeConversation;
    if (ref == null) return;
    final state = stateFor(ref);
    state.error = null;
    notifyListeners();
    try {
      // Create the message first so the attachment is linked atomically from
      // the user's perspective. An empty caption still leaves a searchable
      // file-name message in the conversation.
      final message = await api.sendMessage(
        ref,
        caption.trim().isEmpty ? '📎 ${file.name}' : caption.trim(),
      );
      final attachment = await api.uploadAttachment(
        ref,
        file,
        messageId: message.id,
      );
      final withAttachment = Message(
        id: message.id,
        conversation: message.conversation,
        content: message.content,
        senderId: message.senderId,
        created: message.created,
        sender: message.sender,
        replyTo: message.replyTo,
        attachments: [attachment],
        edited: message.edited,
        deleted: message.deleted,
      );
      state.messages = mergeMessages([...state.messages, withAttachment]);
      state.visibleCount = state.messages.length;
      await database.writeMessages(ref, [withAttachment]);
    } catch (error) {
      state.error = error is ApiException
          ? error.message
          : 'Could not send attachment.';
    }
    await _persistState(ref);
    notifyListeners();
  }

  void updateDraft(ConversationRef ref, String draft) {
    final state = stateFor(ref);
    state.draft = draft;
    unawaited(_persistState(ref));
    notifyListeners();
  }

  void updateScrollOffset(ConversationRef ref, double offset) {
    final state = stateFor(ref);
    if ((state.scrollOffset - offset).abs() < 1) return;
    state.scrollOffset = offset;
    unawaited(_persistState(ref));
  }

  Future<void> _persistState(ConversationRef ref) async {
    final state = stateFor(ref);
    await database.writeState(
      ref,
      hasMore: state.hasMoreRemote,
      visibleCount: state.visibleCount,
      draft: state.draft,
      scrollOffset: state.scrollOffset,
    );
  }

  void _onRealtimeEvent(RealtimeEvent event) {
    final message = event.message;
    if (!event.isMessage || message == null) return;
    final state = stateFor(message.conversation);
    state.messages = mergeMessages([...state.messages, message]);
    state.visibleCount = (state.visibleCount + 1).clamp(
      0,
      state.messages.length,
    );
    unawaited(database.writeMessages(message.conversation, [message]));
    notifyListeners();
  }

  bool _isCurrent(ConversationRef ref, int generation) =>
      activeConversation?.key == ref.key && _generations[ref.key] == generation;

  @override
  void dispose() {
    for (final token in _cancelTokens.values) {
      token.cancel('controller disposed');
    }
    _realtimeSubscription?.cancel();
    super.dispose();
  }
}
