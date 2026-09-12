import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';

import '../../app/providers.dart';
import 'chat_controller.dart';
import '../calls/call_controller.dart';
import '../../models/models.dart';

class ChatShell extends ConsumerStatefulWidget {
  const ChatShell({
    super.key,
    required this.onSignOut,
    required this.onToggleTheme,
    required this.isDark,
  });

  final VoidCallback onSignOut;
  final VoidCallback onToggleTheme;
  final bool isDark;

  @override
  ConsumerState<ChatShell> createState() => _ChatShellState();
}

class _ChatShellState extends ConsumerState<ChatShell> {
  String? _selectedServerId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(chatControllerProvider).initialize();
    });
  }

  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(chatControllerProvider);
    final call = ref.watch(callControllerProvider);
    if (_selectedServerId == null && chat.servers.isNotEmpty) {
      _selectedServerId = chat.servers.first.id;
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        final desktop = constraints.maxWidth >= 900;
        final navigation = _NavigationPane(
          selectedServerId: _selectedServerId,
          onServerSelected: (serverId) =>
              setState(() => _selectedServerId = serverId),
          onConversationSelected: (conversation) {
            ref.read(chatControllerProvider).openConversation(conversation);
            if (!desktop) Navigator.of(context).maybePop();
          },
          onToggleTheme: widget.onToggleTheme,
          onSignOut: widget.onSignOut,
          isDark: widget.isDark,
        );
        final content = Row(
          children: [
            if (desktop)
              _ServerRail(
                servers: chat.servers,
                selectedServerId: _selectedServerId,
                onSelected: (serverId) =>
                    setState(() => _selectedServerId = serverId),
              ),
            if (desktop) SizedBox(width: 272, child: navigation),
            Expanded(child: _ConversationPane()),
          ],
        );
        return Scaffold(
          drawer: desktop ? null : Drawer(child: navigation),
          body: Column(
            children: [
              if (call.status == CallStatus.ringing)
                const _IncomingCallBanner(),
              Expanded(child: content),
            ],
          ),
        );
      },
    );
  }
}

class _ServerRail extends StatelessWidget {
  const _ServerRail({
    required this.servers,
    required this.selectedServerId,
    required this.onSelected,
  });

  final List<Server> servers;
  final String? selectedServerId;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme;
    return Container(
      width: 76,
      color: color.surfaceContainerHighest,
      child: SafeArea(
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: 14),
          itemCount: servers.length,
          separatorBuilder: (context, index) => const SizedBox(height: 9),
          itemBuilder: (context, index) {
            final server = servers[index];
            final selected = server.id == selectedServerId;
            return Tooltip(
              message: server.name,
              child: InkWell(
                onTap: () => onSelected(server.id),
                borderRadius: BorderRadius.circular(18),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  margin: const EdgeInsets.symmetric(horizontal: 12),
                  height: 50,
                  decoration: BoxDecoration(
                    color: selected ? color.primary : color.surface,
                    borderRadius: BorderRadius.circular(selected ? 16 : 25),
                  ),
                  child: Center(
                    child: Text(
                      _initial(server.name),
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: selected ? color.onPrimary : color.onSurface,
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _NavigationPane extends ConsumerWidget {
  const _NavigationPane({
    required this.selectedServerId,
    required this.onServerSelected,
    required this.onConversationSelected,
    required this.onToggleTheme,
    required this.onSignOut,
    required this.isDark,
  });

  final String? selectedServerId;
  final ValueChanged<String> onServerSelected;
  final ValueChanged<ConversationRef> onConversationSelected;
  final VoidCallback onToggleTheme;
  final VoidCallback onSignOut;
  final bool isDark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chat = ref.watch(chatControllerProvider);
    final color = Theme.of(context).colorScheme;
    final user = ref.watch(apiClientProvider).session?.user;
    return Container(
      color: color.surface,
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 10, 10),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 19,
                    backgroundColor: color.primary,
                    child: Text(
                      _initial(user?.label ?? 'S'),
                      style: TextStyle(
                        color: color.onPrimary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      user?.label ?? 'SirverChats',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Notifications',
                    onPressed: () => _showNotifications(context, ref),
                    icon: const Icon(Icons.notifications_none_rounded),
                  ),
                  PopupMenuButton<String>(
                    tooltip: 'Account menu',
                    onSelected: (value) {
                      if (value == 'theme') onToggleTheme();
                      if (value == 'profile') _showProfile(context, user);
                      if (value == 'signout') onSignOut();
                    },
                    itemBuilder: (context) => [
                      const PopupMenuItem(
                        value: 'profile',
                        child: Text('Profile & settings'),
                      ),
                      PopupMenuItem(
                        value: 'theme',
                        child: Text(isDark ? 'Light mode' : 'Dark mode'),
                      ),
                      const PopupMenuItem(
                        value: 'signout',
                        child: Text('Sign out'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (chat.loadingNavigation)
              const LinearProgressIndicator(minHeight: 2),
            if (chat.navigationError != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                child: Text(
                  chat.navigationError!,
                  style: TextStyle(color: color.error, fontSize: 12),
                ),
              ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 8,
                ),
                children: [
                  _SectionLabel(
                    label: 'Spaces',
                    action: Icons.add,
                    onTap: () {},
                  ),
                  ...chat.servers.map((server) {
                    final selected = server.id == selectedServerId;
                    final channels =
                        chat.channelsByServer[server.id] ?? const <Channel>[];
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        ListTile(
                          dense: true,
                          selected: selected,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          leading: CircleAvatar(
                            radius: 15,
                            backgroundColor: color.primaryContainer,
                            child: Text(_initial(server.name)),
                          ),
                          title: Text(
                            server.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          onTap: () => onServerSelected(server.id),
                        ),
                        if (selected)
                          ...channels
                              .where((channel) => channel.type == 'text')
                              .map(
                                (channel) => Padding(
                                  padding: const EdgeInsets.only(left: 22),
                                  child: ListTile(
                                    dense: true,
                                    leading: const Icon(Icons.tag, size: 17),
                                    title: Text(
                                      channel.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    selected:
                                        chat.activeConversation?.id ==
                                        channel.id,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(9),
                                    ),
                                    onTap: () => onConversationSelected(
                                      ConversationRef(
                                        kind: ConversationKind.channel,
                                        id: channel.id,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                      ],
                    );
                  }),
                  const SizedBox(height: 18),
                  _SectionLabel(
                    label: 'Direct messages',
                    action: Icons.add,
                    onTap: () {},
                  ),
                  if (chat.dms.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(
                        'No direct messages yet.',
                        style: TextStyle(
                          color: color.onSurfaceVariant,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ...chat.dms.map(
                    (dm) => ListTile(
                      dense: true,
                      leading: const CircleAvatar(
                        child: Icon(Icons.person_outline, size: 17),
                      ),
                      title: Text(
                        'Conversation ${dm.id.length > 8 ? dm.id.substring(0, 8) : dm.id}',
                      ),
                      selected: chat.activeConversation?.key == dm.key,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(9),
                      ),
                      onTap: () => onConversationSelected(dm),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showNotifications(BuildContext context, WidgetRef ref) async {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Notifications'),
        content: FutureBuilder<List<Map<String, dynamic>>>(
          future: ref.read(apiClientProvider).fetchNotifications(),
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const SizedBox(
                height: 72,
                child: Center(child: CircularProgressIndicator()),
              );
            }
            if (snapshot.hasError) {
              return const Text('Notifications are unavailable right now.');
            }
            final items = snapshot.data ?? const <Map<String, dynamic>>[];
            if (items.isEmpty) return const Text('You are all caught up.');
            return SizedBox(
              width: 360,
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: items.length.clamp(0, 20),
                itemBuilder: (context, index) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.notifications_none),
                  title: Text(
                    (items[index]['title'] ??
                            items[index]['message'] ??
                            'Notification')
                        .toString(),
                  ),
                ),
              ),
            );
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  void _showProfile(BuildContext context, User? user) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Profile & settings'),
        content: Text(
          user == null
              ? 'No profile loaded.'
              : '${user.label}\n@${user.username}\n${user.email}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({
    required this.label,
    required this.action,
    required this.onTap,
  });

  final String label;
  final IconData action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 4, 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label.toUpperCase(),
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                letterSpacing: 1.1,
                fontWeight: FontWeight.w800,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          IconButton(
            onPressed: onTap,
            icon: Icon(action, size: 17),
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}

class _ConversationPane extends ConsumerStatefulWidget {
  const _ConversationPane();

  @override
  ConsumerState<_ConversationPane> createState() => _ConversationPaneState();
}

class _ConversationPaneState extends ConsumerState<_ConversationPane> {
  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(chatControllerProvider);
    final active = chat.activeConversation;
    if (active == null) {
      return const Center(
        child: Text('Select a channel or direct message to begin.'),
      );
    }
    final state = chat.stateFor(active);
    return Column(
      children: [Expanded(child: _ChatFeed(state: state))],
    );
  }
}

class _IncomingCallBanner extends ConsumerWidget {
  const _IncomingCallBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final call = ref.watch(callControllerProvider);
    final caller = call.incomingCaller ?? 'A contact';
    return MaterialBanner(
      content: Text('$caller is calling…'),
      leading: const Icon(Icons.phone_in_talk_rounded),
      actions: [
        TextButton(
          onPressed: call.declineIncoming,
          child: const Text('Decline'),
        ),
        FilledButton.icon(
          onPressed: call.acceptIncoming,
          icon: const Icon(Icons.call),
          label: const Text('Accept'),
        ),
      ],
    );
  }
}

class _ChatFeed extends ConsumerStatefulWidget {
  const _ChatFeed({required this.state});

  final ConversationViewState state;

  @override
  ConsumerState<_ChatFeed> createState() => _ChatFeedState();
}

class _ChatFeedState extends ConsumerState<_ChatFeed> {
  final _scrollController = ScrollController();
  final _composer = TextEditingController();
  bool _restored = false;

  @override
  void initState() {
    super.initState();
    _composer.text = widget.state.draft;
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _composer.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant _ChatFeed oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.state.ref.key != widget.state.ref.key) {
      _restored = false;
      _composer
        ..clear()
        ..text = widget.state.draft;
    }
  }

  void _onScroll() {
    final controller = ref.read(chatControllerProvider);
    controller.updateScrollOffset(widget.state.ref, _scrollController.offset);
    if (_scrollController.hasClients &&
        _scrollController.position.extentBefore < 180) {
      _loadOlder();
    }
  }

  Future<void> _loadOlder() async {
    if (!_scrollController.hasClients) return;
    final beforeExtent = _scrollController.position.maxScrollExtent;
    await ref.read(chatControllerProvider).loadOlder(widget.state.ref);
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      final delta = _scrollController.position.maxScrollExtent - beforeExtent;
      if (delta > 0) {
        _scrollController.jumpTo(
          (_scrollController.offset + delta).clamp(
            0,
            _scrollController.position.maxScrollExtent,
          ),
        );
      }
    });
  }

  void _restoreInitialScroll() {
    if (_restored || !_scrollController.hasClients || widget.state.loading) {
      return;
    }
    _restored = true;
    final target = widget.state.scrollOffset;
    if (target > 0) {
      _scrollController.jumpTo(
        target.clamp(0, _scrollController.position.maxScrollExtent),
      );
    } else {
      _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
    }
  }

  Future<void> _send() async {
    final content = _composer.text.trim();
    if (content.isEmpty) return;
    _composer.clear();
    ref.read(chatControllerProvider).updateDraft(widget.state.ref, '');
    await ref.read(chatControllerProvider).send(content);
    if (mounted) _scrollToBottom();
  }

  Future<void> _pickAttachment() async {
    final file = await FilePicker.pickFile(type: FileType.any);
    if (file == null || !mounted) return;
    await ref.read(chatControllerProvider).sendAttachment(file);
    if (mounted) _scrollToBottom();
  }

  void _scrollToBottom() {
    if (!_scrollController.hasClients) return;
    _scrollController.animateTo(
      _scrollController.position.maxScrollExtent,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(chatControllerProvider);
    final state = chat.stateFor(widget.state.ref);
    final messages = state.visibleMessages;
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _restoreInitialScroll(),
    );
    return Column(
      children: [
        _ChatHeader(
          conversation: state.ref,
          onCall: () => _showCallSheet(context, state.ref),
        ),
        if (state.error != null)
          MaterialBanner(
            content: Text(state.error!),
            actions: [
              TextButton(
                onPressed: () => ref
                    .read(chatControllerProvider)
                    .openConversation(state.ref),
                child: const Text('Retry'),
              ),
            ],
          ),
        Expanded(
          child: state.loading && messages.isEmpty
              ? const _MessageSkeleton()
              : messages.isEmpty
              ? const Center(
                  child: Text('No messages yet. Start the conversation.'),
                )
              : ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(18, 18, 18, 10),
                  scrollCacheExtent: ScrollCacheExtent.pixels(600),
                  itemCount: messages.length + (state.loadingOlder ? 1 : 0),
                  itemBuilder: (context, index) {
                    if (index == 0 && state.loadingOlder) {
                      return const Padding(
                        padding: EdgeInsets.only(bottom: 10),
                        child: Center(
                          child: SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                      );
                    }
                    final offset = state.loadingOlder ? index - 1 : index;
                    return _MessageTile(message: messages[offset]);
                  },
                ),
        ),
        _Composer(
          controller: _composer,
          onChanged: (value) =>
              ref.read(chatControllerProvider).updateDraft(state.ref, value),
          onSend: _send,
          onAttach: () => _pickAttachment(),
        ),
      ],
    );
  }

  Future<void> _showCallSheet(
    BuildContext context,
    ConversationRef conversation,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _CallSheet(conversation: conversation),
    );
  }
}

class _ChatHeader extends StatelessWidget {
  const _ChatHeader({required this.conversation, required this.onCall});

  final ConversationRef conversation;
  final VoidCallback onCall;

  @override
  Widget build(BuildContext context) {
    final title = conversation.kind == ConversationKind.channel
        ? '# ${conversation.id}'
        : 'Direct message';
    return Material(
      color: Theme.of(context).colorScheme.surface,
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 66,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Row(
              children: [
                if (MediaQuery.sizeOf(context).width < 900)
                  Builder(
                    builder: (context) => IconButton(
                      onPressed: () => Scaffold.of(context).openDrawer(),
                      icon: const Icon(Icons.menu),
                    ),
                  ),
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: onCall,
                  tooltip: 'Start call',
                  icon: const Icon(Icons.call_outlined),
                ),
                IconButton(
                  onPressed: () {},
                  tooltip: 'Search',
                  icon: const Icon(Icons.search),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MessageTile extends StatelessWidget {
  const _MessageTile({required this.message});

  final Message message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final sender =
        message.sender?.label ??
        (message.senderId.isEmpty ? 'You' : message.senderId);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: theme.colorScheme.primaryContainer,
            child: Text(_initial(sender)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest.withValues(
                  alpha: .35,
                ),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 9, 12, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            sender,
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _formatTime(message.created),
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        if (message.pending) ...[
                          const SizedBox(width: 6),
                          const SizedBox.square(
                            dimension: 11,
                            child: CircularProgressIndicator(strokeWidth: 1.5),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(message.content),
                    if (message.attachments.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: message.attachments
                            .take(4)
                            .map((attachment) {
                              final image =
                                  attachment.thumbnailUrl ?? attachment.url;
                              return GestureDetector(
                                onTap: () => _openOriginal(context, attachment),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Image.network(
                                    image,
                                    width: 132,
                                    height: 92,
                                    fit: BoxFit.cover,
                                    cacheWidth: 264,
                                    filterQuality: FilterQuality.low,
                                    errorBuilder:
                                        (
                                          context,
                                          error,
                                          stackTrace,
                                        ) => Container(
                                          width: 132,
                                          height: 92,
                                          color: theme.colorScheme.surface,
                                          child: const Icon(
                                            Icons.insert_drive_file_outlined,
                                          ),
                                        ),
                                  ),
                                ),
                              );
                            })
                            .toList(growable: false),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _openOriginal(BuildContext context, Attachment attachment) {
    if (attachment.url.isEmpty) return;
    showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        child: InteractiveViewer(
          minScale: .5,
          maxScale: 4,
          child: Image.network(attachment.url),
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.onChanged,
    required this.onSend,
    required this.onAttach,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onSend;
  final VoidCallback onAttach;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            IconButton(
              onPressed: onAttach,
              tooltip: 'Attach file',
              icon: const Icon(Icons.add_circle_outline),
            ),
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 6,
                textInputAction: TextInputAction.newline,
                onChanged: onChanged,
                decoration: const InputDecoration(hintText: 'Write a message…'),
                onSubmitted: (_) => onSend(),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: onSend,
              tooltip: 'Send',
              icon: const Icon(Icons.send_rounded),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageSkeleton extends StatelessWidget {
  const _MessageSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(18),
      itemCount: 8,
      itemBuilder: (_, index) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            const CircleAvatar(radius: 18),
            const SizedBox(width: 10),
            Expanded(
              child: Container(
                height: index.isEven ? 54 : 38,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CallSheet extends ConsumerWidget {
  const _CallSheet({required this.conversation});

  final ConversationRef conversation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.watch(callControllerProvider);
    final user = ref.watch(apiClientProvider).session?.user;
    final room = 'sirver-${conversation.id}';
    return Padding(
      padding: EdgeInsets.fromLTRB(
        22,
        18,
        22,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Voice and video call',
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text('Room: $room', style: Theme.of(context).textTheme.bodySmall),
          if (controller.error != null) ...[
            const SizedBox(height: 12),
            Text(
              controller.error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: 18),
          if (controller.status == CallStatus.connected) ...[
            Text(
              'Connected',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 14),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 10,
              children: [
                IconButton.filledTonal(
                  onPressed: controller.toggleMicrophone,
                  icon: Icon(
                    controller.microphoneEnabled ? Icons.mic : Icons.mic_off,
                  ),
                ),
                IconButton.filledTonal(
                  onPressed: controller.toggleCamera,
                  icon: Icon(
                    controller.cameraEnabled
                        ? Icons.videocam
                        : Icons.videocam_off,
                  ),
                ),
                IconButton.filledTonal(
                  onPressed: controller.toggleScreenShare,
                  icon: Icon(
                    controller.screenShareEnabled
                        ? Icons.stop_screen_share
                        : Icons.screen_share,
                  ),
                ),
                IconButton.filled(
                  onPressed: () => controller.leave(),
                  icon: const Icon(Icons.call_end),
                ),
              ],
            ),
          ] else
            FilledButton.icon(
              onPressed:
                  controller.status == CallStatus.connecting || user == null
                  ? null
                  : () => controller.join(
                      room: room,
                      identity: user.id,
                      name: user.label,
                      forConversation: conversation,
                      withCamera: false,
                    ),
              icon: controller.status == CallStatus.connecting
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.call),
              label: Text(
                controller.status == CallStatus.connecting
                    ? 'Connecting…'
                    : 'Join call',
              ),
            ),
        ],
      ),
    );
  }
}

String _formatTime(DateTime value) {
  final local = value.toLocal();
  final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
  final minute = local.minute.toString().padLeft(2, '0');
  return '$hour:$minute ${local.hour >= 12 ? 'PM' : 'AM'}';
}

String _initial(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty ? '?' : trimmed.substring(0, 1).toUpperCase();
}
