import 'dart:convert';

enum ConversationKind { channel, dm }

extension ConversationKindJson on ConversationKind {
  String get wireName => this == ConversationKind.channel ? 'channel' : 'dm';
}

class ConversationRef {
  const ConversationRef({required this.kind, required this.id});

  final ConversationKind kind;
  final String id;

  String get key => '${kind.wireName}:$id';
}

class MessageCursor {
  const MessageCursor({required this.created, required this.id});

  final String created;
  final String id;

  Map<String, String> toJson() => {'created': created, 'id': id};

  static MessageCursor? fromJson(Object? value) {
    if (value is! Map) return null;
    final created = value['created']?.toString();
    final id = value['id']?.toString();
    if (created == null || created.isEmpty || id == null || id.isEmpty) {
      return null;
    }
    return MessageCursor(created: created, id: id);
  }
}

class MessagePage<T> {
  const MessagePage({
    required this.items,
    required this.nextCursor,
    required this.hasMore,
  });

  final List<T> items;
  final MessageCursor? nextCursor;
  final bool hasMore;
}

class User {
  const User({
    required this.id,
    required this.username,
    this.email = '',
    this.displayName,
    this.avatar,
    this.status = 'offline',
    this.bio,
  });

  final String id;
  final String username;
  final String email;
  final String? displayName;
  final String? avatar;
  final String status;
  final String? bio;

  String get label =>
      (displayName?.trim().isNotEmpty ?? false) ? displayName! : username;

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: _string(json['id']),
      username: _string(json['username'], fallback: 'user'),
      email: _string(json['email']),
      displayName: _nullableString(json['display_name'] ?? json['displayName']),
      avatar: _nullableString(json['avatar']),
      status: _string(json['status'], fallback: 'offline'),
      bio: _nullableString(json['bio']),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'username': username,
    'email': email,
    if (displayName != null) 'display_name': displayName,
    if (avatar != null) 'avatar': avatar,
    'status': status,
    if (bio != null) 'bio': bio,
  };
}

class Server {
  const Server({
    required this.id,
    required this.name,
    this.description,
    this.icon,
    this.banner,
    this.owner,
    this.defaultChannel,
  });

  final String id;
  final String name;
  final String? description;
  final String? icon;
  final String? banner;
  final String? owner;
  final String? defaultChannel;

  factory Server.fromJson(Map<String, dynamic> json) => Server(
    id: _string(json['id']),
    name: _string(json['name'], fallback: 'Server'),
    description: _nullableString(json['description']),
    icon: _nullableString(json['icon']),
    banner: _nullableString(json['banner']),
    owner: _nullableString(json['owner']),
    defaultChannel: _nullableString(
      json['default_channel'] ?? json['defaultChannel'],
    ),
  );
}

class Channel {
  const Channel({
    required this.id,
    required this.serverId,
    required this.name,
    this.topic,
    this.type = 'text',
    this.position = 0,
  });

  final String id;
  final String serverId;
  final String name;
  final String? topic;
  final String type;
  final int position;

  factory Channel.fromJson(Map<String, dynamic> json) => Channel(
    id: _string(json['id']),
    serverId: _string(json['server'] ?? json['server_id']),
    name: _string(json['name'], fallback: 'channel'),
    topic: _nullableString(json['topic']),
    type: _string(json['type'], fallback: 'text'),
    position: int.tryParse(_string(json['position'], fallback: '0')) ?? 0,
  );
}

class Attachment {
  const Attachment({
    required this.id,
    required this.url,
    this.name,
    this.mimeType,
    this.size,
    this.width,
    this.height,
    this.thumbnailUrl,
  });

  final String id;
  final String url;
  final String? name;
  final String? mimeType;
  final int? size;
  final int? width;
  final int? height;
  final String? thumbnailUrl;

  factory Attachment.fromJson(Map<String, dynamic> json) => Attachment(
    id: _string(json['id']),
    url: _string(json['url'] ?? json['file']),
    name: _nullableString(json['name'] ?? json['title'] ?? json['displayName']),
    mimeType: _nullableString(json['mime_type'] ?? json['type']),
    size: _int(json['size']),
    width: _int(json['width']),
    height: _int(json['height']),
    thumbnailUrl: _nullableString(
      json['thumbnail_url'] ?? json['thumbnailUrl'],
    ),
  );
}

class Message {
  const Message({
    required this.id,
    required this.conversation,
    required this.content,
    required this.senderId,
    required this.created,
    this.sender,
    this.replyTo,
    this.attachments = const [],
    this.edited = false,
    this.deleted = false,
    this.pending = false,
  });

  final String id;
  final ConversationRef conversation;
  final String content;
  final String senderId;
  final DateTime created;
  final User? sender;
  final String? replyTo;
  final List<Attachment> attachments;
  final bool edited;
  final bool deleted;
  final bool pending;

  MessageCursor get cursor =>
      MessageCursor(created: created.toUtc().toIso8601String(), id: id);

  factory Message.fromJson(
    Map<String, dynamic> json, {
    ConversationRef? conversation,
  }) {
    final expand = _map(json['expand']);
    final senderJson = _map(
      json['sender'] ?? json['user'] ?? expand?['sender'],
    );
    final rawAttachments =
        json['attachments_via_message'] ??
        json['private_attachments_via_message'] ??
        expand?['attachments_via_message'] ??
        expand?['private_attachments_via_message'] ??
        json['attachments'] ??
        const <Object>[];
    final attachments = rawAttachments is List
        ? rawAttachments
              .whereType<Map>()
              .map(
                (item) => Attachment.fromJson(Map<String, dynamic>.from(item)),
              )
              .toList(growable: false)
        : const <Attachment>[];
    final created =
        DateTime.tryParse(_string(json['created']))?.toUtc() ??
        DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
    final kind =
        _string(json['conversation_kind'] ?? json['kind']) == 'dm' ||
            json.containsKey('chat_server') ||
            json.containsKey('private_chat_id')
        ? ConversationKind.dm
        : ConversationKind.channel;
    final ref =
        conversation ??
        ConversationRef(
          kind: kind,
          id: _string(
            json['conversation_id'] ??
                json['channel'] ??
                json['chat_server'] ??
                json['private_chat_id'],
          ),
        );
    return Message(
      id: _string(json['id']),
      conversation: ref,
      content: _string(json['content']),
      senderId: _string(json['sender_id'] ?? json['user'] ?? json['sender']),
      created: created,
      sender: senderJson == null ? null : User.fromJson(senderJson),
      replyTo: _nullableString(json['reply_to']),
      attachments: attachments,
      edited: json['edited'] == true || json['edited_at'] != null,
      deleted: json['deleted'] == true || json['deleted_at'] != null,
      pending: json['is_pending'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'conversation_kind': conversation.kind.wireName,
    'conversation_id': conversation.id,
    'content': content,
    'sender_id': senderId,
    'created': created.toUtc().toIso8601String(),
    if (sender != null) 'sender': sender!.toJson(),
    if (replyTo != null) 'reply_to': replyTo,
    'attachments': attachments
        .map(
          (attachment) => {
            'id': attachment.id,
            'url': attachment.url,
            if (attachment.name != null) 'name': attachment.name,
            if (attachment.mimeType != null) 'mime_type': attachment.mimeType,
            if (attachment.size != null) 'size': attachment.size,
            if (attachment.width != null) 'width': attachment.width,
            if (attachment.height != null) 'height': attachment.height,
            if (attachment.thumbnailUrl != null)
              'thumbnail_url': attachment.thumbnailUrl,
          },
        )
        .toList(growable: false),
    'edited': edited,
    'deleted': deleted,
    if (pending) 'is_pending': true,
  };

  String encode() => jsonEncode(toJson());
}

class AuthSession {
  const AuthSession({
    required this.accessToken,
    this.refreshToken,
    required this.user,
    this.expiresAt,
  });

  final String accessToken;
  final String? refreshToken;
  final User user;
  final DateTime? expiresAt;

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    final userJson =
        _map(json['user'] ?? json['record'] ?? json['model']) ??
        <String, dynamic>{};
    return AuthSession(
      accessToken: _string(
        json['accessToken'] ?? json['access_token'] ?? json['token'],
      ),
      refreshToken: _nullableString(
        json['refreshToken'] ?? json['refresh_token'],
      ),
      user: User.fromJson(userJson),
      expiresAt: DateTime.tryParse(
        _string(json['expiresAt'] ?? json['expires_at']),
      ),
    );
  }
}

class RealtimeEvent {
  const RealtimeEvent({
    required this.type,
    this.conversation,
    this.message,
    this.data = const <String, dynamic>{},
  });

  final String type;
  final ConversationRef? conversation;
  final Message? message;
  final Map<String, dynamic> data;

  bool get isMessage =>
      type == 'message.created' ||
      type == 'message.updated' ||
      type == 'message.deleted';
  bool get isCall => type.startsWith('call.');

  factory RealtimeEvent.fromJson(Map<String, dynamic> json) {
    final type = _string(json['type'], fallback: 'unknown');
    final nestedData = _map(json['data']);
    final conversationJson =
        _map(json['conversation']) ?? _map(nestedData?['conversation']);
    final kindValue = _string(
      conversationJson?['kind'] ??
          json['conversation_kind'] ??
          nestedData?['conversation_kind'] ??
          json['kind'],
    );
    final id = _string(
      conversationJson?['id'] ??
          json['conversation_id'] ??
          nestedData?['conversation_id'] ??
          json['channel_id'] ??
          json['channelId'] ??
          nestedData?['channel_id'] ??
          nestedData?['channelId'] ??
          json['chat_server'] ??
          nestedData?['chat_server'],
    );
    final conversation = id.isEmpty
        ? null
        : ConversationRef(
            kind: kindValue == 'dm'
                ? ConversationKind.dm
                : ConversationKind.channel,
            id: id,
          );
    final messageJson =
        _map(json['message']) ??
        (type.startsWith('message.') ? _map(json['data']) : null);
    return RealtimeEvent(
      type: type,
      conversation: conversation,
      message: messageJson == null || conversation == null
          ? null
          : Message.fromJson(messageJson, conversation: conversation),
      data: Map<String, dynamic>.from(json),
    );
  }
}

String _string(Object? value, {String fallback = ''}) {
  if (value == null) return fallback;
  final result = value.toString();
  return result.isEmpty ? fallback : result;
}

String? _nullableString(Object? value) {
  final result = _string(value);
  return result.isEmpty ? null : result;
}

int? _int(Object? value) {
  if (value is int) return value;
  return int.tryParse(_string(value));
}

Map<String, dynamic>? _map(Object? value) {
  if (value is! Map) return null;
  return Map<String, dynamic>.from(value);
}
