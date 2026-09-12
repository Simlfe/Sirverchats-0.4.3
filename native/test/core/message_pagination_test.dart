import 'package:flutter_test/flutter_test.dart';

import 'package:sirver_chats_native/core/message_pagination.dart';
import 'package:sirver_chats_native/models/models.dart';

void main() {
  const conversation = ConversationRef(
    kind: ConversationKind.channel,
    id: 'general',
  );
  final timestamp = DateTime.utc(2026, 1, 1, 12, 0);

  Message message(String id, {DateTime? created}) => Message(
    id: id,
    conversation: conversation,
    content: id,
    senderId: 'user',
    created: created ?? timestamp,
  );

  test('cursor predicate includes timestamp and ID tie-breaker', () {
    expect(
      cursorPredicate(
        const MessageCursor(created: '2026-01-01T12:00:00.000Z', id: 'm2'),
      ),
      '(created < "2026-01-01 12:00:00.000Z" OR (created = "2026-01-01 12:00:00.000Z" AND id < "m2"))',
    );
  });

  test('equal timestamps are sorted and deduplicated exactly once', () {
    final merged = mergeMessages([
      message('m3'),
      message('m1'),
      message('m2'),
      message('m2'),
    ]);
    expect(merged.map((item) => item.id), ['m1', 'm2', 'm3']);
  });

  test('history remains available when remote hasMore is false', () {
    expect(hasCachedHistory(visibleCount: 30, totalCount: 80), isTrue);
    expect(hasCachedHistory(visibleCount: 80, totalCount: 80), isFalse);
  });

  test('repeated pages keep the newest 500 messages without duplicates', () {
    final pages = List.generate(
      20,
      (page) => List.generate(
        50,
        (index) => message(
          'm${page * 50 + index}',
          created: timestamp.add(Duration(minutes: page * 50 + index)),
        ),
      ),
    );
    final merged = mergeMessages(pages.expand((page) => page));
    expect(merged, hasLength(500));
    expect(merged.first.id, 'm500');
    expect(merged.last.id, 'm999');
    expect(merged.map((item) => item.id).toSet(), hasLength(500));
  });

  test('older-page window follows the upward scroll boundary', () {
    final existing = List.generate(
      500,
      (index) => message(
        'm${index + 50}',
        created: timestamp.add(Duration(minutes: index + 50)),
      ),
    );
    final older = List.generate(
      50,
      (index) =>
          message('m$index', created: timestamp.add(Duration(minutes: index))),
    );
    final merged = mergeMessages([...existing, ...older], keepNewest: false);
    expect(merged, hasLength(500));
    expect(merged.first.id, 'm0');
    expect(merged.last.id, 'm499');
  });
}
