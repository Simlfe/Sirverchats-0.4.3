import 'package:flutter_test/flutter_test.dart';

import 'package:sirver_chats_native/models/models.dart';

void main() {
  test('normalizes a single realtime message event without a refetch hint', () {
    final event = RealtimeEvent.fromJson({
      'type': 'message.created',
      'conversation': {'kind': 'dm', 'id': 'dm-1'},
      'message': {
        'id': 'm-1',
        'conversation_kind': 'dm',
        'conversation_id': 'dm-1',
        'content': 'hello',
        'sender_id': 'u-1',
        'created': '2026-01-01T12:00:00.000Z',
      },
    });

    expect(event.isMessage, isTrue);
    expect(event.message?.conversation.kind, ConversationKind.dm);
    expect(event.message?.conversation.id, 'dm-1');
    expect(event.message?.id, 'm-1');
  });

  test('keeps nested call conversation data for ringing/accept flows', () {
    final event = RealtimeEvent.fromJson({
      'type': 'call.ringing',
      'data': {
        'callId': 'call-1',
        'room': 'sirver-dm-1',
        'conversation': {'kind': 'dm', 'id': 'dm-1'},
      },
    });

    expect(event.isCall, isTrue);
    expect((event.data['data'] as Map)['callId'], 'call-1');
    expect((event.data['data'] as Map)['conversation']['id'], 'dm-1');
  });
}
