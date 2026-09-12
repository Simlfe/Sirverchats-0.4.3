// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'local_database.dart';

// ignore_for_file: type=lint
class $CachedMessagesTable extends CachedMessages
    with TableInfo<$CachedMessagesTable, CachedMessage> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CachedMessagesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _conversationKeyMeta = const VerificationMeta(
    'conversationKey',
  );
  @override
  late final GeneratedColumn<String> conversationKey = GeneratedColumn<String>(
    'conversation_key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdMeta = const VerificationMeta(
    'created',
  );
  @override
  late final GeneratedColumn<String> created = GeneratedColumn<String>(
    'created',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _payloadMeta = const VerificationMeta(
    'payload',
  );
  @override
  late final GeneratedColumn<String> payload = GeneratedColumn<String>(
    'payload',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _payloadBytesMeta = const VerificationMeta(
    'payloadBytes',
  );
  @override
  late final GeneratedColumn<int> payloadBytes = GeneratedColumn<int>(
    'payload_bytes',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _fetchedAtMeta = const VerificationMeta(
    'fetchedAt',
  );
  @override
  late final GeneratedColumn<DateTime> fetchedAt = GeneratedColumn<DateTime>(
    'fetched_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    conversationKey,
    id,
    created,
    payload,
    payloadBytes,
    fetchedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'cached_messages';
  @override
  VerificationContext validateIntegrity(
    Insertable<CachedMessage> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('conversation_key')) {
      context.handle(
        _conversationKeyMeta,
        conversationKey.isAcceptableOrUnknown(
          data['conversation_key']!,
          _conversationKeyMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_conversationKeyMeta);
    }
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('created')) {
      context.handle(
        _createdMeta,
        created.isAcceptableOrUnknown(data['created']!, _createdMeta),
      );
    } else if (isInserting) {
      context.missing(_createdMeta);
    }
    if (data.containsKey('payload')) {
      context.handle(
        _payloadMeta,
        payload.isAcceptableOrUnknown(data['payload']!, _payloadMeta),
      );
    } else if (isInserting) {
      context.missing(_payloadMeta);
    }
    if (data.containsKey('payload_bytes')) {
      context.handle(
        _payloadBytesMeta,
        payloadBytes.isAcceptableOrUnknown(
          data['payload_bytes']!,
          _payloadBytesMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_payloadBytesMeta);
    }
    if (data.containsKey('fetched_at')) {
      context.handle(
        _fetchedAtMeta,
        fetchedAt.isAcceptableOrUnknown(data['fetched_at']!, _fetchedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_fetchedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {conversationKey, id};
  @override
  CachedMessage map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CachedMessage(
      conversationKey: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}conversation_key'],
      )!,
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      created: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}created'],
      )!,
      payload: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}payload'],
      )!,
      payloadBytes: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}payload_bytes'],
      )!,
      fetchedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}fetched_at'],
      )!,
    );
  }

  @override
  $CachedMessagesTable createAlias(String alias) {
    return $CachedMessagesTable(attachedDatabase, alias);
  }
}

class CachedMessage extends DataClass implements Insertable<CachedMessage> {
  final String conversationKey;
  final String id;
  final String created;
  final String payload;
  final int payloadBytes;
  final DateTime fetchedAt;
  const CachedMessage({
    required this.conversationKey,
    required this.id,
    required this.created,
    required this.payload,
    required this.payloadBytes,
    required this.fetchedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['conversation_key'] = Variable<String>(conversationKey);
    map['id'] = Variable<String>(id);
    map['created'] = Variable<String>(created);
    map['payload'] = Variable<String>(payload);
    map['payload_bytes'] = Variable<int>(payloadBytes);
    map['fetched_at'] = Variable<DateTime>(fetchedAt);
    return map;
  }

  CachedMessagesCompanion toCompanion(bool nullToAbsent) {
    return CachedMessagesCompanion(
      conversationKey: Value(conversationKey),
      id: Value(id),
      created: Value(created),
      payload: Value(payload),
      payloadBytes: Value(payloadBytes),
      fetchedAt: Value(fetchedAt),
    );
  }

  factory CachedMessage.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CachedMessage(
      conversationKey: serializer.fromJson<String>(json['conversationKey']),
      id: serializer.fromJson<String>(json['id']),
      created: serializer.fromJson<String>(json['created']),
      payload: serializer.fromJson<String>(json['payload']),
      payloadBytes: serializer.fromJson<int>(json['payloadBytes']),
      fetchedAt: serializer.fromJson<DateTime>(json['fetchedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'conversationKey': serializer.toJson<String>(conversationKey),
      'id': serializer.toJson<String>(id),
      'created': serializer.toJson<String>(created),
      'payload': serializer.toJson<String>(payload),
      'payloadBytes': serializer.toJson<int>(payloadBytes),
      'fetchedAt': serializer.toJson<DateTime>(fetchedAt),
    };
  }

  CachedMessage copyWith({
    String? conversationKey,
    String? id,
    String? created,
    String? payload,
    int? payloadBytes,
    DateTime? fetchedAt,
  }) => CachedMessage(
    conversationKey: conversationKey ?? this.conversationKey,
    id: id ?? this.id,
    created: created ?? this.created,
    payload: payload ?? this.payload,
    payloadBytes: payloadBytes ?? this.payloadBytes,
    fetchedAt: fetchedAt ?? this.fetchedAt,
  );
  CachedMessage copyWithCompanion(CachedMessagesCompanion data) {
    return CachedMessage(
      conversationKey: data.conversationKey.present
          ? data.conversationKey.value
          : this.conversationKey,
      id: data.id.present ? data.id.value : this.id,
      created: data.created.present ? data.created.value : this.created,
      payload: data.payload.present ? data.payload.value : this.payload,
      payloadBytes: data.payloadBytes.present
          ? data.payloadBytes.value
          : this.payloadBytes,
      fetchedAt: data.fetchedAt.present ? data.fetchedAt.value : this.fetchedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CachedMessage(')
          ..write('conversationKey: $conversationKey, ')
          ..write('id: $id, ')
          ..write('created: $created, ')
          ..write('payload: $payload, ')
          ..write('payloadBytes: $payloadBytes, ')
          ..write('fetchedAt: $fetchedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    conversationKey,
    id,
    created,
    payload,
    payloadBytes,
    fetchedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CachedMessage &&
          other.conversationKey == this.conversationKey &&
          other.id == this.id &&
          other.created == this.created &&
          other.payload == this.payload &&
          other.payloadBytes == this.payloadBytes &&
          other.fetchedAt == this.fetchedAt);
}

class CachedMessagesCompanion extends UpdateCompanion<CachedMessage> {
  final Value<String> conversationKey;
  final Value<String> id;
  final Value<String> created;
  final Value<String> payload;
  final Value<int> payloadBytes;
  final Value<DateTime> fetchedAt;
  final Value<int> rowid;
  const CachedMessagesCompanion({
    this.conversationKey = const Value.absent(),
    this.id = const Value.absent(),
    this.created = const Value.absent(),
    this.payload = const Value.absent(),
    this.payloadBytes = const Value.absent(),
    this.fetchedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CachedMessagesCompanion.insert({
    required String conversationKey,
    required String id,
    required String created,
    required String payload,
    required int payloadBytes,
    required DateTime fetchedAt,
    this.rowid = const Value.absent(),
  }) : conversationKey = Value(conversationKey),
       id = Value(id),
       created = Value(created),
       payload = Value(payload),
       payloadBytes = Value(payloadBytes),
       fetchedAt = Value(fetchedAt);
  static Insertable<CachedMessage> custom({
    Expression<String>? conversationKey,
    Expression<String>? id,
    Expression<String>? created,
    Expression<String>? payload,
    Expression<int>? payloadBytes,
    Expression<DateTime>? fetchedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (conversationKey != null) 'conversation_key': conversationKey,
      if (id != null) 'id': id,
      if (created != null) 'created': created,
      if (payload != null) 'payload': payload,
      if (payloadBytes != null) 'payload_bytes': payloadBytes,
      if (fetchedAt != null) 'fetched_at': fetchedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CachedMessagesCompanion copyWith({
    Value<String>? conversationKey,
    Value<String>? id,
    Value<String>? created,
    Value<String>? payload,
    Value<int>? payloadBytes,
    Value<DateTime>? fetchedAt,
    Value<int>? rowid,
  }) {
    return CachedMessagesCompanion(
      conversationKey: conversationKey ?? this.conversationKey,
      id: id ?? this.id,
      created: created ?? this.created,
      payload: payload ?? this.payload,
      payloadBytes: payloadBytes ?? this.payloadBytes,
      fetchedAt: fetchedAt ?? this.fetchedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (conversationKey.present) {
      map['conversation_key'] = Variable<String>(conversationKey.value);
    }
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (created.present) {
      map['created'] = Variable<String>(created.value);
    }
    if (payload.present) {
      map['payload'] = Variable<String>(payload.value);
    }
    if (payloadBytes.present) {
      map['payload_bytes'] = Variable<int>(payloadBytes.value);
    }
    if (fetchedAt.present) {
      map['fetched_at'] = Variable<DateTime>(fetchedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CachedMessagesCompanion(')
          ..write('conversationKey: $conversationKey, ')
          ..write('id: $id, ')
          ..write('created: $created, ')
          ..write('payload: $payload, ')
          ..write('payloadBytes: $payloadBytes, ')
          ..write('fetchedAt: $fetchedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ConversationStatesTable extends ConversationStates
    with TableInfo<$ConversationStatesTable, ConversationState> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ConversationStatesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _conversationKeyMeta = const VerificationMeta(
    'conversationKey',
  );
  @override
  late final GeneratedColumn<String> conversationKey = GeneratedColumn<String>(
    'conversation_key',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nextCreatedMeta = const VerificationMeta(
    'nextCreated',
  );
  @override
  late final GeneratedColumn<String> nextCreated = GeneratedColumn<String>(
    'next_created',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _nextIdMeta = const VerificationMeta('nextId');
  @override
  late final GeneratedColumn<String> nextId = GeneratedColumn<String>(
    'next_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _hasMoreMeta = const VerificationMeta(
    'hasMore',
  );
  @override
  late final GeneratedColumn<bool> hasMore = GeneratedColumn<bool>(
    'has_more',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("has_more" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  static const VerificationMeta _visibleCountMeta = const VerificationMeta(
    'visibleCount',
  );
  @override
  late final GeneratedColumn<int> visibleCount = GeneratedColumn<int>(
    'visible_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _draftMeta = const VerificationMeta('draft');
  @override
  late final GeneratedColumn<String> draft = GeneratedColumn<String>(
    'draft',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _scrollOffsetMeta = const VerificationMeta(
    'scrollOffset',
  );
  @override
  late final GeneratedColumn<double> scrollOffset = GeneratedColumn<double>(
    'scroll_offset',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _touchedAtMeta = const VerificationMeta(
    'touchedAt',
  );
  @override
  late final GeneratedColumn<DateTime> touchedAt = GeneratedColumn<DateTime>(
    'touched_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    conversationKey,
    nextCreated,
    nextId,
    hasMore,
    visibleCount,
    draft,
    scrollOffset,
    touchedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'conversation_states';
  @override
  VerificationContext validateIntegrity(
    Insertable<ConversationState> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('conversation_key')) {
      context.handle(
        _conversationKeyMeta,
        conversationKey.isAcceptableOrUnknown(
          data['conversation_key']!,
          _conversationKeyMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_conversationKeyMeta);
    }
    if (data.containsKey('next_created')) {
      context.handle(
        _nextCreatedMeta,
        nextCreated.isAcceptableOrUnknown(
          data['next_created']!,
          _nextCreatedMeta,
        ),
      );
    }
    if (data.containsKey('next_id')) {
      context.handle(
        _nextIdMeta,
        nextId.isAcceptableOrUnknown(data['next_id']!, _nextIdMeta),
      );
    }
    if (data.containsKey('has_more')) {
      context.handle(
        _hasMoreMeta,
        hasMore.isAcceptableOrUnknown(data['has_more']!, _hasMoreMeta),
      );
    }
    if (data.containsKey('visible_count')) {
      context.handle(
        _visibleCountMeta,
        visibleCount.isAcceptableOrUnknown(
          data['visible_count']!,
          _visibleCountMeta,
        ),
      );
    }
    if (data.containsKey('draft')) {
      context.handle(
        _draftMeta,
        draft.isAcceptableOrUnknown(data['draft']!, _draftMeta),
      );
    }
    if (data.containsKey('scroll_offset')) {
      context.handle(
        _scrollOffsetMeta,
        scrollOffset.isAcceptableOrUnknown(
          data['scroll_offset']!,
          _scrollOffsetMeta,
        ),
      );
    }
    if (data.containsKey('touched_at')) {
      context.handle(
        _touchedAtMeta,
        touchedAt.isAcceptableOrUnknown(data['touched_at']!, _touchedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_touchedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {conversationKey};
  @override
  ConversationState map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ConversationState(
      conversationKey: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}conversation_key'],
      )!,
      nextCreated: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}next_created'],
      ),
      nextId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}next_id'],
      ),
      hasMore: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}has_more'],
      )!,
      visibleCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}visible_count'],
      )!,
      draft: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}draft'],
      )!,
      scrollOffset: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}scroll_offset'],
      )!,
      touchedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}touched_at'],
      )!,
    );
  }

  @override
  $ConversationStatesTable createAlias(String alias) {
    return $ConversationStatesTable(attachedDatabase, alias);
  }
}

class ConversationState extends DataClass
    implements Insertable<ConversationState> {
  final String conversationKey;
  final String? nextCreated;
  final String? nextId;
  final bool hasMore;
  final int visibleCount;
  final String draft;
  final double scrollOffset;
  final DateTime touchedAt;
  const ConversationState({
    required this.conversationKey,
    this.nextCreated,
    this.nextId,
    required this.hasMore,
    required this.visibleCount,
    required this.draft,
    required this.scrollOffset,
    required this.touchedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['conversation_key'] = Variable<String>(conversationKey);
    if (!nullToAbsent || nextCreated != null) {
      map['next_created'] = Variable<String>(nextCreated);
    }
    if (!nullToAbsent || nextId != null) {
      map['next_id'] = Variable<String>(nextId);
    }
    map['has_more'] = Variable<bool>(hasMore);
    map['visible_count'] = Variable<int>(visibleCount);
    map['draft'] = Variable<String>(draft);
    map['scroll_offset'] = Variable<double>(scrollOffset);
    map['touched_at'] = Variable<DateTime>(touchedAt);
    return map;
  }

  ConversationStatesCompanion toCompanion(bool nullToAbsent) {
    return ConversationStatesCompanion(
      conversationKey: Value(conversationKey),
      nextCreated: nextCreated == null && nullToAbsent
          ? const Value.absent()
          : Value(nextCreated),
      nextId: nextId == null && nullToAbsent
          ? const Value.absent()
          : Value(nextId),
      hasMore: Value(hasMore),
      visibleCount: Value(visibleCount),
      draft: Value(draft),
      scrollOffset: Value(scrollOffset),
      touchedAt: Value(touchedAt),
    );
  }

  factory ConversationState.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ConversationState(
      conversationKey: serializer.fromJson<String>(json['conversationKey']),
      nextCreated: serializer.fromJson<String?>(json['nextCreated']),
      nextId: serializer.fromJson<String?>(json['nextId']),
      hasMore: serializer.fromJson<bool>(json['hasMore']),
      visibleCount: serializer.fromJson<int>(json['visibleCount']),
      draft: serializer.fromJson<String>(json['draft']),
      scrollOffset: serializer.fromJson<double>(json['scrollOffset']),
      touchedAt: serializer.fromJson<DateTime>(json['touchedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'conversationKey': serializer.toJson<String>(conversationKey),
      'nextCreated': serializer.toJson<String?>(nextCreated),
      'nextId': serializer.toJson<String?>(nextId),
      'hasMore': serializer.toJson<bool>(hasMore),
      'visibleCount': serializer.toJson<int>(visibleCount),
      'draft': serializer.toJson<String>(draft),
      'scrollOffset': serializer.toJson<double>(scrollOffset),
      'touchedAt': serializer.toJson<DateTime>(touchedAt),
    };
  }

  ConversationState copyWith({
    String? conversationKey,
    Value<String?> nextCreated = const Value.absent(),
    Value<String?> nextId = const Value.absent(),
    bool? hasMore,
    int? visibleCount,
    String? draft,
    double? scrollOffset,
    DateTime? touchedAt,
  }) => ConversationState(
    conversationKey: conversationKey ?? this.conversationKey,
    nextCreated: nextCreated.present ? nextCreated.value : this.nextCreated,
    nextId: nextId.present ? nextId.value : this.nextId,
    hasMore: hasMore ?? this.hasMore,
    visibleCount: visibleCount ?? this.visibleCount,
    draft: draft ?? this.draft,
    scrollOffset: scrollOffset ?? this.scrollOffset,
    touchedAt: touchedAt ?? this.touchedAt,
  );
  ConversationState copyWithCompanion(ConversationStatesCompanion data) {
    return ConversationState(
      conversationKey: data.conversationKey.present
          ? data.conversationKey.value
          : this.conversationKey,
      nextCreated: data.nextCreated.present
          ? data.nextCreated.value
          : this.nextCreated,
      nextId: data.nextId.present ? data.nextId.value : this.nextId,
      hasMore: data.hasMore.present ? data.hasMore.value : this.hasMore,
      visibleCount: data.visibleCount.present
          ? data.visibleCount.value
          : this.visibleCount,
      draft: data.draft.present ? data.draft.value : this.draft,
      scrollOffset: data.scrollOffset.present
          ? data.scrollOffset.value
          : this.scrollOffset,
      touchedAt: data.touchedAt.present ? data.touchedAt.value : this.touchedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ConversationState(')
          ..write('conversationKey: $conversationKey, ')
          ..write('nextCreated: $nextCreated, ')
          ..write('nextId: $nextId, ')
          ..write('hasMore: $hasMore, ')
          ..write('visibleCount: $visibleCount, ')
          ..write('draft: $draft, ')
          ..write('scrollOffset: $scrollOffset, ')
          ..write('touchedAt: $touchedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    conversationKey,
    nextCreated,
    nextId,
    hasMore,
    visibleCount,
    draft,
    scrollOffset,
    touchedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ConversationState &&
          other.conversationKey == this.conversationKey &&
          other.nextCreated == this.nextCreated &&
          other.nextId == this.nextId &&
          other.hasMore == this.hasMore &&
          other.visibleCount == this.visibleCount &&
          other.draft == this.draft &&
          other.scrollOffset == this.scrollOffset &&
          other.touchedAt == this.touchedAt);
}

class ConversationStatesCompanion extends UpdateCompanion<ConversationState> {
  final Value<String> conversationKey;
  final Value<String?> nextCreated;
  final Value<String?> nextId;
  final Value<bool> hasMore;
  final Value<int> visibleCount;
  final Value<String> draft;
  final Value<double> scrollOffset;
  final Value<DateTime> touchedAt;
  final Value<int> rowid;
  const ConversationStatesCompanion({
    this.conversationKey = const Value.absent(),
    this.nextCreated = const Value.absent(),
    this.nextId = const Value.absent(),
    this.hasMore = const Value.absent(),
    this.visibleCount = const Value.absent(),
    this.draft = const Value.absent(),
    this.scrollOffset = const Value.absent(),
    this.touchedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ConversationStatesCompanion.insert({
    required String conversationKey,
    this.nextCreated = const Value.absent(),
    this.nextId = const Value.absent(),
    this.hasMore = const Value.absent(),
    this.visibleCount = const Value.absent(),
    this.draft = const Value.absent(),
    this.scrollOffset = const Value.absent(),
    required DateTime touchedAt,
    this.rowid = const Value.absent(),
  }) : conversationKey = Value(conversationKey),
       touchedAt = Value(touchedAt);
  static Insertable<ConversationState> custom({
    Expression<String>? conversationKey,
    Expression<String>? nextCreated,
    Expression<String>? nextId,
    Expression<bool>? hasMore,
    Expression<int>? visibleCount,
    Expression<String>? draft,
    Expression<double>? scrollOffset,
    Expression<DateTime>? touchedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (conversationKey != null) 'conversation_key': conversationKey,
      if (nextCreated != null) 'next_created': nextCreated,
      if (nextId != null) 'next_id': nextId,
      if (hasMore != null) 'has_more': hasMore,
      if (visibleCount != null) 'visible_count': visibleCount,
      if (draft != null) 'draft': draft,
      if (scrollOffset != null) 'scroll_offset': scrollOffset,
      if (touchedAt != null) 'touched_at': touchedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ConversationStatesCompanion copyWith({
    Value<String>? conversationKey,
    Value<String?>? nextCreated,
    Value<String?>? nextId,
    Value<bool>? hasMore,
    Value<int>? visibleCount,
    Value<String>? draft,
    Value<double>? scrollOffset,
    Value<DateTime>? touchedAt,
    Value<int>? rowid,
  }) {
    return ConversationStatesCompanion(
      conversationKey: conversationKey ?? this.conversationKey,
      nextCreated: nextCreated ?? this.nextCreated,
      nextId: nextId ?? this.nextId,
      hasMore: hasMore ?? this.hasMore,
      visibleCount: visibleCount ?? this.visibleCount,
      draft: draft ?? this.draft,
      scrollOffset: scrollOffset ?? this.scrollOffset,
      touchedAt: touchedAt ?? this.touchedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (conversationKey.present) {
      map['conversation_key'] = Variable<String>(conversationKey.value);
    }
    if (nextCreated.present) {
      map['next_created'] = Variable<String>(nextCreated.value);
    }
    if (nextId.present) {
      map['next_id'] = Variable<String>(nextId.value);
    }
    if (hasMore.present) {
      map['has_more'] = Variable<bool>(hasMore.value);
    }
    if (visibleCount.present) {
      map['visible_count'] = Variable<int>(visibleCount.value);
    }
    if (draft.present) {
      map['draft'] = Variable<String>(draft.value);
    }
    if (scrollOffset.present) {
      map['scroll_offset'] = Variable<double>(scrollOffset.value);
    }
    if (touchedAt.present) {
      map['touched_at'] = Variable<DateTime>(touchedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ConversationStatesCompanion(')
          ..write('conversationKey: $conversationKey, ')
          ..write('nextCreated: $nextCreated, ')
          ..write('nextId: $nextId, ')
          ..write('hasMore: $hasMore, ')
          ..write('visibleCount: $visibleCount, ')
          ..write('draft: $draft, ')
          ..write('scrollOffset: $scrollOffset, ')
          ..write('touchedAt: $touchedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$AppDatabase extends GeneratedDatabase {
  _$AppDatabase(QueryExecutor e) : super(e);
  $AppDatabaseManager get managers => $AppDatabaseManager(this);
  late final $CachedMessagesTable cachedMessages = $CachedMessagesTable(this);
  late final $ConversationStatesTable conversationStates =
      $ConversationStatesTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    cachedMessages,
    conversationStates,
  ];
}

typedef $$CachedMessagesTableCreateCompanionBuilder =
    CachedMessagesCompanion Function({
      required String conversationKey,
      required String id,
      required String created,
      required String payload,
      required int payloadBytes,
      required DateTime fetchedAt,
      Value<int> rowid,
    });
typedef $$CachedMessagesTableUpdateCompanionBuilder =
    CachedMessagesCompanion Function({
      Value<String> conversationKey,
      Value<String> id,
      Value<String> created,
      Value<String> payload,
      Value<int> payloadBytes,
      Value<DateTime> fetchedAt,
      Value<int> rowid,
    });

class $$CachedMessagesTableFilterComposer
    extends Composer<_$AppDatabase, $CachedMessagesTable> {
  $$CachedMessagesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get conversationKey => $composableBuilder(
    column: $table.conversationKey,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get created => $composableBuilder(
    column: $table.created,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get payload => $composableBuilder(
    column: $table.payload,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get payloadBytes => $composableBuilder(
    column: $table.payloadBytes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get fetchedAt => $composableBuilder(
    column: $table.fetchedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$CachedMessagesTableOrderingComposer
    extends Composer<_$AppDatabase, $CachedMessagesTable> {
  $$CachedMessagesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get conversationKey => $composableBuilder(
    column: $table.conversationKey,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get created => $composableBuilder(
    column: $table.created,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get payload => $composableBuilder(
    column: $table.payload,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get payloadBytes => $composableBuilder(
    column: $table.payloadBytes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get fetchedAt => $composableBuilder(
    column: $table.fetchedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CachedMessagesTableAnnotationComposer
    extends Composer<_$AppDatabase, $CachedMessagesTable> {
  $$CachedMessagesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get conversationKey => $composableBuilder(
    column: $table.conversationKey,
    builder: (column) => column,
  );

  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get created =>
      $composableBuilder(column: $table.created, builder: (column) => column);

  GeneratedColumn<String> get payload =>
      $composableBuilder(column: $table.payload, builder: (column) => column);

  GeneratedColumn<int> get payloadBytes => $composableBuilder(
    column: $table.payloadBytes,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get fetchedAt =>
      $composableBuilder(column: $table.fetchedAt, builder: (column) => column);
}

class $$CachedMessagesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $CachedMessagesTable,
          CachedMessage,
          $$CachedMessagesTableFilterComposer,
          $$CachedMessagesTableOrderingComposer,
          $$CachedMessagesTableAnnotationComposer,
          $$CachedMessagesTableCreateCompanionBuilder,
          $$CachedMessagesTableUpdateCompanionBuilder,
          (
            CachedMessage,
            BaseReferences<_$AppDatabase, $CachedMessagesTable, CachedMessage>,
          ),
          CachedMessage,
          PrefetchHooks Function()
        > {
  $$CachedMessagesTableTableManager(
    _$AppDatabase db,
    $CachedMessagesTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CachedMessagesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CachedMessagesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CachedMessagesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> conversationKey = const Value.absent(),
                Value<String> id = const Value.absent(),
                Value<String> created = const Value.absent(),
                Value<String> payload = const Value.absent(),
                Value<int> payloadBytes = const Value.absent(),
                Value<DateTime> fetchedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CachedMessagesCompanion(
                conversationKey: conversationKey,
                id: id,
                created: created,
                payload: payload,
                payloadBytes: payloadBytes,
                fetchedAt: fetchedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String conversationKey,
                required String id,
                required String created,
                required String payload,
                required int payloadBytes,
                required DateTime fetchedAt,
                Value<int> rowid = const Value.absent(),
              }) => CachedMessagesCompanion.insert(
                conversationKey: conversationKey,
                id: id,
                created: created,
                payload: payload,
                payloadBytes: payloadBytes,
                fetchedAt: fetchedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$CachedMessagesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $CachedMessagesTable,
      CachedMessage,
      $$CachedMessagesTableFilterComposer,
      $$CachedMessagesTableOrderingComposer,
      $$CachedMessagesTableAnnotationComposer,
      $$CachedMessagesTableCreateCompanionBuilder,
      $$CachedMessagesTableUpdateCompanionBuilder,
      (
        CachedMessage,
        BaseReferences<_$AppDatabase, $CachedMessagesTable, CachedMessage>,
      ),
      CachedMessage,
      PrefetchHooks Function()
    >;
typedef $$ConversationStatesTableCreateCompanionBuilder =
    ConversationStatesCompanion Function({
      required String conversationKey,
      Value<String?> nextCreated,
      Value<String?> nextId,
      Value<bool> hasMore,
      Value<int> visibleCount,
      Value<String> draft,
      Value<double> scrollOffset,
      required DateTime touchedAt,
      Value<int> rowid,
    });
typedef $$ConversationStatesTableUpdateCompanionBuilder =
    ConversationStatesCompanion Function({
      Value<String> conversationKey,
      Value<String?> nextCreated,
      Value<String?> nextId,
      Value<bool> hasMore,
      Value<int> visibleCount,
      Value<String> draft,
      Value<double> scrollOffset,
      Value<DateTime> touchedAt,
      Value<int> rowid,
    });

class $$ConversationStatesTableFilterComposer
    extends Composer<_$AppDatabase, $ConversationStatesTable> {
  $$ConversationStatesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get conversationKey => $composableBuilder(
    column: $table.conversationKey,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nextCreated => $composableBuilder(
    column: $table.nextCreated,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get nextId => $composableBuilder(
    column: $table.nextId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get hasMore => $composableBuilder(
    column: $table.hasMore,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get visibleCount => $composableBuilder(
    column: $table.visibleCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get draft => $composableBuilder(
    column: $table.draft,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get scrollOffset => $composableBuilder(
    column: $table.scrollOffset,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get touchedAt => $composableBuilder(
    column: $table.touchedAt,
    builder: (column) => ColumnFilters(column),
  );
}

class $$ConversationStatesTableOrderingComposer
    extends Composer<_$AppDatabase, $ConversationStatesTable> {
  $$ConversationStatesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get conversationKey => $composableBuilder(
    column: $table.conversationKey,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nextCreated => $composableBuilder(
    column: $table.nextCreated,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get nextId => $composableBuilder(
    column: $table.nextId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get hasMore => $composableBuilder(
    column: $table.hasMore,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get visibleCount => $composableBuilder(
    column: $table.visibleCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get draft => $composableBuilder(
    column: $table.draft,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get scrollOffset => $composableBuilder(
    column: $table.scrollOffset,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get touchedAt => $composableBuilder(
    column: $table.touchedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ConversationStatesTableAnnotationComposer
    extends Composer<_$AppDatabase, $ConversationStatesTable> {
  $$ConversationStatesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get conversationKey => $composableBuilder(
    column: $table.conversationKey,
    builder: (column) => column,
  );

  GeneratedColumn<String> get nextCreated => $composableBuilder(
    column: $table.nextCreated,
    builder: (column) => column,
  );

  GeneratedColumn<String> get nextId =>
      $composableBuilder(column: $table.nextId, builder: (column) => column);

  GeneratedColumn<bool> get hasMore =>
      $composableBuilder(column: $table.hasMore, builder: (column) => column);

  GeneratedColumn<int> get visibleCount => $composableBuilder(
    column: $table.visibleCount,
    builder: (column) => column,
  );

  GeneratedColumn<String> get draft =>
      $composableBuilder(column: $table.draft, builder: (column) => column);

  GeneratedColumn<double> get scrollOffset => $composableBuilder(
    column: $table.scrollOffset,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get touchedAt =>
      $composableBuilder(column: $table.touchedAt, builder: (column) => column);
}

class $$ConversationStatesTableTableManager
    extends
        RootTableManager<
          _$AppDatabase,
          $ConversationStatesTable,
          ConversationState,
          $$ConversationStatesTableFilterComposer,
          $$ConversationStatesTableOrderingComposer,
          $$ConversationStatesTableAnnotationComposer,
          $$ConversationStatesTableCreateCompanionBuilder,
          $$ConversationStatesTableUpdateCompanionBuilder,
          (
            ConversationState,
            BaseReferences<
              _$AppDatabase,
              $ConversationStatesTable,
              ConversationState
            >,
          ),
          ConversationState,
          PrefetchHooks Function()
        > {
  $$ConversationStatesTableTableManager(
    _$AppDatabase db,
    $ConversationStatesTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ConversationStatesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ConversationStatesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ConversationStatesTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> conversationKey = const Value.absent(),
                Value<String?> nextCreated = const Value.absent(),
                Value<String?> nextId = const Value.absent(),
                Value<bool> hasMore = const Value.absent(),
                Value<int> visibleCount = const Value.absent(),
                Value<String> draft = const Value.absent(),
                Value<double> scrollOffset = const Value.absent(),
                Value<DateTime> touchedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ConversationStatesCompanion(
                conversationKey: conversationKey,
                nextCreated: nextCreated,
                nextId: nextId,
                hasMore: hasMore,
                visibleCount: visibleCount,
                draft: draft,
                scrollOffset: scrollOffset,
                touchedAt: touchedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String conversationKey,
                Value<String?> nextCreated = const Value.absent(),
                Value<String?> nextId = const Value.absent(),
                Value<bool> hasMore = const Value.absent(),
                Value<int> visibleCount = const Value.absent(),
                Value<String> draft = const Value.absent(),
                Value<double> scrollOffset = const Value.absent(),
                required DateTime touchedAt,
                Value<int> rowid = const Value.absent(),
              }) => ConversationStatesCompanion.insert(
                conversationKey: conversationKey,
                nextCreated: nextCreated,
                nextId: nextId,
                hasMore: hasMore,
                visibleCount: visibleCount,
                draft: draft,
                scrollOffset: scrollOffset,
                touchedAt: touchedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$ConversationStatesTableProcessedTableManager =
    ProcessedTableManager<
      _$AppDatabase,
      $ConversationStatesTable,
      ConversationState,
      $$ConversationStatesTableFilterComposer,
      $$ConversationStatesTableOrderingComposer,
      $$ConversationStatesTableAnnotationComposer,
      $$ConversationStatesTableCreateCompanionBuilder,
      $$ConversationStatesTableUpdateCompanionBuilder,
      (
        ConversationState,
        BaseReferences<
          _$AppDatabase,
          $ConversationStatesTable,
          ConversationState
        >,
      ),
      ConversationState,
      PrefetchHooks Function()
    >;

class $AppDatabaseManager {
  final _$AppDatabase _db;
  $AppDatabaseManager(this._db);
  $$CachedMessagesTableTableManager get cachedMessages =>
      $$CachedMessagesTableTableManager(_db, _db.cachedMessages);
  $$ConversationStatesTableTableManager get conversationStates =>
      $$ConversationStatesTableTableManager(_db, _db.conversationStates);
}
