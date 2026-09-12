import '../models/models.dart';

/// Produces the strict cursor predicate used by both server and DM queries.
/// The ID comparison is required because PocketBase timestamps are not unique.
String cursorPredicate(MessageCursor cursor) {
  final created = cursor.created.replaceFirst('T', ' ');
  return '(created < "$created" OR (created = "$created" AND id < "${cursor.id}"))';
}

List<Message> mergeMessages(
  Iterable<Message> messages, {
  int maxItems = 500,
  bool keepNewest = true,
}) {
  final byId = <String, Message>{};
  for (final message in messages) {
    if (message.id.isNotEmpty && !message.deleted) byId[message.id] = message;
  }
  final sorted = byId.values.toList()
    ..sort((a, b) {
      final created = a.created.compareTo(b.created);
      return created == 0 ? a.id.compareTo(b.id) : created;
    });
  final safeMax = maxItems.clamp(1, 5000);
  if (sorted.length <= safeMax) return List<Message>.unmodifiable(sorted);
  final start = keepNewest ? sorted.length - safeMax : 0;
  return List<Message>.unmodifiable(sorted.sublist(start, start + safeMax));
}

bool hasCachedHistory({required int visibleCount, required int totalCount}) {
  return visibleCount < totalCount;
}
