import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

import '../models/models.dart';

part 'local_database.g.dart';

class CachedMessages extends Table {
  TextColumn get conversationKey => text()();
  TextColumn get id => text()();
  TextColumn get created => text()();
  TextColumn get payload => text()();
  IntColumn get payloadBytes => integer()();
  DateTimeColumn get fetchedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {conversationKey, id};
}

class ConversationStates extends Table {
  TextColumn get conversationKey => text()();
  TextColumn get nextCreated => text().nullable()();
  TextColumn get nextId => text().nullable()();
  BoolColumn get hasMore => boolean().withDefault(const Constant(true))();
  IntColumn get visibleCount => integer().withDefault(const Constant(0))();
  TextColumn get draft => text().withDefault(const Constant(''))();
  RealColumn get scrollOffset => real().withDefault(const Constant(0))();
  DateTimeColumn get touchedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {conversationKey};
}

class ConversationCacheSnapshot {
  const ConversationCacheSnapshot({
    required this.messages,
    required this.cursor,
    required this.hasMore,
    required this.visibleCount,
    required this.draft,
    required this.scrollOffset,
  });

  final List<Message> messages;
  final MessageCursor? cursor;
  final bool hasMore;
  final int visibleCount;
  final String draft;
  final double scrollOffset;
}

@DriftDatabase(tables: [CachedMessages, ConversationStates])
class AppDatabase extends _$AppDatabase {
  AppDatabase({QueryExecutor? executor})
    : super(
        executor ??
            driftDatabase(
              name: 'sirver_chats_cache',
              native: const DriftNativeOptions(shareAcrossIsolates: true),
              web: DriftWebOptions(
                sqlite3Wasm: Uri.parse('sqlite3.wasm'),
                driftWorker: Uri.parse('drift_worker.js'),
              ),
            ),
      );

  static const maxCacheBytes = 100 * 1024 * 1024;
  static const activeMemoryLimit = 500;

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) => m.createAll(),
    onUpgrade: (m, from, to) async {
      if (from < 1) await m.createAll();
    },
  );

  Future<ConversationCacheSnapshot?> readConversation(
    ConversationRef ref,
  ) async {
    final rows =
        await (select(cachedMessages)
              ..where((row) => row.conversationKey.equals(ref.key))
              ..orderBy([
                (row) => OrderingTerm(
                  expression: row.created,
                  mode: OrderingMode.desc,
                ),
                (row) =>
                    OrderingTerm(expression: row.id, mode: OrderingMode.desc),
              ])
              ..limit(activeMemoryLimit))
            .get();
    final state = await (select(
      conversationStates,
    )..where((row) => row.conversationKey.equals(ref.key))).getSingleOrNull();
    if (rows.isEmpty && state == null) return null;
    if (rows.isNotEmpty) {
      // Reading a conversation is a cache hit. Refresh its access time so the
      // global 100 MB budget evicts the least recently used pages first.
      await (update(
        cachedMessages,
      )..where((row) => row.conversationKey.equals(ref.key))).write(
        CachedMessagesCompanion(fetchedAt: Value(DateTime.now().toUtc())),
      );
    }
    final messages = rows.reversed
        .map(
          (row) => Message.fromJson(
            Map<String, dynamic>.from(jsonDecode(row.payload) as Map),
            conversation: ref,
          ),
        )
        .toList(growable: false);
    return ConversationCacheSnapshot(
      messages: messages,
      cursor: state == null || state.nextCreated == null || state.nextId == null
          ? null
          : MessageCursor(created: state.nextCreated!, id: state.nextId!),
      hasMore: state?.hasMore ?? true,
      visibleCount: state?.visibleCount ?? messages.length,
      draft: state?.draft ?? '',
      scrollOffset: state?.scrollOffset ?? 0,
    );
  }

  /// Reads the next cached page strictly before [before]. Keeping this query
  /// separate from [readConversation] lets the active Dart window stay capped
  /// at 500 messages while older IndexedDB/SQLite pages remain discoverable.
  Future<List<Message>> readMessagesBefore(
    ConversationRef ref,
    MessageCursor before, {
    int limit = 50,
  }) async {
    final safeLimit = limit.clamp(1, 100);
    final rows =
        await (select(cachedMessages)
              ..where(
                (row) =>
                    row.conversationKey.equals(ref.key) &
                    (row.created.isSmallerThanValue(before.created) |
                        (row.created.equals(before.created) &
                            row.id.isSmallerThanValue(before.id))),
              )
              ..orderBy([
                (row) => OrderingTerm(
                  expression: row.created,
                  mode: OrderingMode.desc,
                ),
                (row) =>
                    OrderingTerm(expression: row.id, mode: OrderingMode.desc),
              ])
              ..limit(safeLimit))
            .get();
    if (rows.isNotEmpty) {
      await (update(
        cachedMessages,
      )..where((row) => row.conversationKey.equals(ref.key))).write(
        CachedMessagesCompanion(fetchedAt: Value(DateTime.now().toUtc())),
      );
    }
    return rows
        .map(
          (row) => Message.fromJson(
            Map<String, dynamic>.from(jsonDecode(row.payload) as Map),
            conversation: ref,
          ),
        )
        .toList(growable: false);
  }

  Future<void> writeMessages(
    ConversationRef ref,
    Iterable<Message> messages,
  ) async {
    final now = DateTime.now().toUtc();
    await batch((batch) {
      for (final message in messages) {
        final payload = message.encode();
        batch.insert(
          cachedMessages,
          CachedMessagesCompanion.insert(
            conversationKey: ref.key,
            id: message.id,
            created: message.created.toUtc().toIso8601String(),
            payload: payload,
            payloadBytes: utf8.encode(payload).length,
            fetchedAt: now,
          ),
          mode: InsertMode.insertOrReplace,
        );
      }
    });
    await evictToBudget();
  }

  Future<void> writeState(
    ConversationRef ref, {
    MessageCursor? cursor,
    bool updateCursor = false,
    required bool hasMore,
    required int visibleCount,
    String? draft,
    double? scrollOffset,
  }) async {
    final previous = await (select(
      conversationStates,
    )..where((row) => row.conversationKey.equals(ref.key))).getSingleOrNull();
    await into(conversationStates).insertOnConflictUpdate(
      ConversationStatesCompanion.insert(
        conversationKey: ref.key,
        nextCreated: Value(
          updateCursor ? cursor?.created : previous?.nextCreated,
        ),
        nextId: Value(updateCursor ? cursor?.id : previous?.nextId),
        hasMore: Value(hasMore),
        visibleCount: Value(visibleCount),
        draft: Value(draft ?? previous?.draft ?? ''),
        scrollOffset: Value(scrollOffset ?? previous?.scrollOffset ?? 0),
        touchedAt: DateTime.now().toUtc(),
      ),
    );
  }

  Future<void> evictToBudget() async {
    final rows = await (select(
      cachedMessages,
    )..orderBy([(row) => OrderingTerm(expression: row.fetchedAt)])).get();
    var total = rows.fold<int>(0, (sum, row) => sum + row.payloadBytes);
    if (total <= maxCacheBytes) return;
    await batch((batch) {
      for (final row in rows) {
        if (total <= maxCacheBytes) break;
        total -= row.payloadBytes;
        batch.delete(cachedMessages, row);
      }
    });
  }

  Future<void> clearConversation(ConversationRef ref) async {
    await transaction(() async {
      await (delete(
        cachedMessages,
      )..where((row) => row.conversationKey.equals(ref.key))).go();
      await (delete(
        conversationStates,
      )..where((row) => row.conversationKey.equals(ref.key))).go();
    });
  }

  Future<void> clearAll() async {
    await transaction(() async {
      await delete(cachedMessages).go();
      await delete(conversationStates).go();
    });
  }
}
