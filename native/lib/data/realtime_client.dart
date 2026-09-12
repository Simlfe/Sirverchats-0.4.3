import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

import '../models/models.dart';

const kRealtimeUrl = String.fromEnvironment(
  'SIRVER_REALTIME_URL',
  defaultValue: 'wss://chat.sirverdata.top/api/v2/ws',
);

class RealtimeClient {
  RealtimeClient({String? url}) : _url = url ?? kRealtimeUrl;

  final String _url;
  final _events = StreamController<RealtimeEvent>.broadcast();
  WebSocketChannel? _channel;
  StreamSubscription<Object?>? _subscription;
  Timer? _reconnectTimer;
  String? _token;
  List<ConversationRef> _conversations = const [];
  bool _shouldConnect = false;
  bool _socketReady = false;
  int _generation = 0;
  Duration _backoff = const Duration(seconds: 1);

  Stream<RealtimeEvent> get events => _events.stream;
  bool get isConnected => _socketReady;

  Future<void> connect({
    required String token,
    Iterable<ConversationRef> conversations = const [],
  }) async {
    _token = token;
    _conversations = List<ConversationRef>.unmodifiable(conversations);
    _shouldConnect = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    if (_channel != null) return;
    await _open();
  }

  void updateSubscriptions(Iterable<ConversationRef> conversations) {
    _conversations = List<ConversationRef>.unmodifiable(conversations);
    if (_socketReady) {
      _send({
        'type': 'subscribe',
        'conversations': _conversations
            .map(
              (conversation) => {
                'kind': conversation.kind.wireName,
                'id': conversation.id,
              },
            )
            .toList(growable: false),
      });
    }
  }

  void sendCallEvent({
    required String type,
    required Map<String, dynamic> data,
  }) {
    _send({'type': type, 'data': data});
  }

  Future<void> disconnect() async {
    _shouldConnect = false;
    _token = null;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _generation++;
    await _closeSocket();
  }

  Future<void> dispose() async {
    await disconnect();
    await _events.close();
  }

  Future<void> _open() async {
    final generation = ++_generation;
    final token = _token;
    if (!_shouldConnect || token == null || token.isEmpty) return;
    try {
      final channel = WebSocketChannel.connect(Uri.parse(_url));
      _channel = channel;
      await channel.ready;
      if (!_shouldConnect || generation != _generation) {
        await channel.sink.close();
        return;
      }
      _socketReady = true;
      _backoff = const Duration(seconds: 1);
      _send({'type': 'auth', 'token': token});
      updateSubscriptions(_conversations);
      _subscription = channel.stream.listen(
        (raw) => _onMessage(raw),
        onError: (_, _) => _onClosed(generation),
        onDone: () => _onClosed(generation),
        cancelOnError: true,
      );
    } catch (_) {
      _onClosed(generation);
    }
  }

  void _onMessage(Object? raw) {
    if (raw is! String) return;
    try {
      final json = jsonDecode(raw);
      if (json is Map) {
        _events.add(RealtimeEvent.fromJson(Map<String, dynamic>.from(json)));
      }
    } catch (_) {
      // Ignore malformed events. The socket remains usable for later events.
    }
  }

  void _onClosed(int generation) {
    if (generation != _generation) return;
    _socketReady = false;
    _channel = null;
    _subscription = null;
    if (!_shouldConnect || _reconnectTimer != null) return;
    final delay = _backoff;
    _backoff = Duration(seconds: (_backoff.inSeconds * 2).clamp(1, 30));
    _reconnectTimer = Timer(delay, () {
      _reconnectTimer = null;
      unawaited(_open());
    });
  }

  void _send(Map<String, dynamic> payload) {
    final channel = _channel;
    if (channel == null || !_socketReady) return;
    try {
      channel.sink.add(jsonEncode(payload));
    } catch (_) {
      // The close handler schedules a reconnect if this socket is no longer usable.
    }
  }

  Future<void> _closeSocket() async {
    final channel = _channel;
    final subscription = _subscription;
    _subscription = null;
    _socketReady = false;
    _channel = null;
    await subscription?.cancel();
    try {
      await channel?.sink.close();
    } catch (_) {
      // Socket was already closed.
    }
  }
}
