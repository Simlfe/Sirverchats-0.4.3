import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';

const kApiBaseUrl = String.fromEnvironment(
  'SIRVER_API_BASE_URL',
  defaultValue: 'https://chat.sirverdata.top/api/v2',
);
const kLiveKitUrl = String.fromEnvironment(
  'SIRVER_LIVEKIT_URL',
  defaultValue: 'wss://sfu.sirverdata.top',
);

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode, this.cause});

  final String message;
  final int? statusCode;
  final Object? cause;

  @override
  String toString() => 'ApiException(${statusCode ?? 'network'}): $message';
}

class ApiClient {
  ApiClient({Dio? dio, NativeCredentialStore? storage, String? baseUrl})
    : _storage = storage ?? const NativeCredentialStore(),
      _dio =
          dio ??
          Dio(
            BaseOptions(
              baseUrl: (baseUrl ?? kApiBaseUrl).replaceFirst(
                RegExp(r'/+$'),
                '',
              ),
              connectTimeout: const Duration(seconds: 10),
              sendTimeout: const Duration(seconds: 20),
              receiveTimeout: const Duration(seconds: 20),
              responseType: ResponseType.json,
              headers: const {'Accept': 'application/json'},
            ),
          ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = _accessToken;
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  static const _accessTokenKey = 'sirver_native_access_token';
  static const _refreshTokenKey = 'sirver_native_refresh_token';
  static const _userKey = 'sirver_native_user';
  static const _expiresAtKey = 'sirver_native_expires_at';

  final Dio _dio;
  final NativeCredentialStore _storage;
  String? _accessToken;
  String? _refreshToken;
  AuthSession? _session;
  Future<AuthSession?>? _refreshInFlight;

  AuthSession? get session => _session;
  String? get accessToken => _accessToken;

  Future<AuthSession?> restoreSession() async {
    final token = await _storage.read(key: _accessTokenKey);
    if (token == null || token.isEmpty) return null;
    final userJson = await _storage.read(key: _userKey);
    if (userJson == null) return null;
    try {
      final user = User.fromJson(
        Map<String, dynamic>.from(jsonDecode(userJson) as Map),
      );
      final expiresValue = await _storage.read(key: _expiresAtKey);
      final expiresAt = expiresValue == null
          ? null
          : DateTime.tryParse(expiresValue);
      _accessToken = token;
      _refreshToken = await _storage.read(key: _refreshTokenKey);
      _session = AuthSession(
        accessToken: token,
        refreshToken: _refreshToken,
        user: user,
        expiresAt: expiresAt,
      );
      return _session;
    } catch (_) {
      await logout(localOnly: true);
      return null;
    }
  }

  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    final response = await _request(
      () => _dio.post<Map<String, dynamic>>(
        '/auth/login',
        data: {'email': email.trim(), 'password': password},
      ),
    );
    final session = AuthSession.fromJson(_asMap(response.data));
    if (session.accessToken.isEmpty || session.user.id.isEmpty) {
      throw const ApiException(
        'The server returned an incomplete login response.',
      );
    }
    await _setSession(session);
    return session;
  }

  Future<AuthSession?> refresh() async {
    return _refreshInternal();
  }

  Future<AuthSession?> _refreshInternal() async {
    final inFlight = _refreshInFlight;
    if (inFlight != null) return inFlight;
    final refreshToken = _refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) return null;
    final future = _refreshRequest(refreshToken);
    _refreshInFlight = future;
    try {
      return await future;
    } finally {
      if (identical(_refreshInFlight, future)) _refreshInFlight = null;
    }
  }

  Future<AuthSession?> _refreshRequest(String refreshToken) async {
    try {
      final response = await _request(
        () => _dio.post<Map<String, dynamic>>(
          '/auth/refresh',
          data: {'refreshToken': refreshToken},
        ),
        retryOnUnauthorized: false,
      );
      final session = AuthSession.fromJson(_asMap(response.data));
      if (session.accessToken.isEmpty) return null;
      await _setSession(session);
      return session;
    } on ApiException {
      await logout(localOnly: true);
      return null;
    }
  }

  Future<void> logout({bool localOnly = false}) async {
    if (!localOnly && _accessToken != null) {
      try {
        await _dio.post<void>('/auth/logout');
      } catch (_) {
        // Local cleanup must still happen if the network is offline.
      }
    }
    _accessToken = null;
    _refreshToken = null;
    _session = null;
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
      _storage.delete(key: _userKey),
      _storage.delete(key: _expiresAtKey),
    ]);
  }

  Future<User> me() async {
    final response = await _request(
      () => _dio.get<Map<String, dynamic>>('/me'),
    );
    return User.fromJson(
      _asMap(response.data)['user'] is Map
          ? Map<String, dynamic>.from(_asMap(response.data)['user'] as Map)
          : _asMap(response.data),
    );
  }

  Future<List<Server>> listServers() async {
    final response = await _request(() => _dio.get<Object>('/servers'));
    return _asList(response.data).map(Server.fromJson).toList(growable: false);
  }

  Future<List<Channel>> listChannels(String serverId) async {
    final response = await _request(
      () => _dio.get<Object>('/servers/$serverId/channels'),
    );
    final channels = _asList(response.data).map(Channel.fromJson).toList();
    channels.sort((a, b) => a.position.compareTo(b.position));
    return channels;
  }

  Future<List<ConversationRef>> listDms() async {
    final response = await _request(() => _dio.get<Object>('/dms'));
    return _asList(response.data)
        .map(
          (json) => ConversationRef(
            kind: ConversationKind.dm,
            id: (json['id'] ?? json['chat_server'] ?? json['chatServer'] ?? '')
                .toString(),
          ),
        )
        .where((conversation) => conversation.id.isNotEmpty)
        .toList(growable: false);
  }

  Future<List<User>> fetchUsers(Iterable<String> ids) async {
    final unique = ids
        .where((id) => id.isNotEmpty)
        .toSet()
        .toList(growable: false);
    if (unique.isEmpty) return const [];
    final response = await _request(
      () => _dio.get<Object>(
        '/users',
        queryParameters: {'ids': unique.join(',')},
      ),
    );
    return _asList(response.data).map(User.fromJson).toList(growable: false);
  }

  Future<List<Map<String, dynamic>>> fetchNotifications() async {
    final response = await _request(() => _dio.get<Object>('/notifications'));
    return _asList(response.data);
  }

  Future<MessagePage<Message>> fetchMessages(
    ConversationRef conversation, {
    int limit = 30,
    MessageCursor? before,
    CancelToken? cancelToken,
  }) async {
    final query = <String, dynamic>{'limit': limit.clamp(1, 100)};
    if (before != null) {
      query['beforeCreated'] = before.created;
      query['beforeId'] = before.id;
    }
    final response = await _request(
      () => _dio.get<Object>(
        '/conversations/${conversation.kind.wireName}/${Uri.encodeComponent(conversation.id)}/messages',
        queryParameters: query,
        cancelToken: cancelToken,
      ),
    );
    final payload = _asMap(response.data);
    final rawItems = payload['items'] ?? payload['records'] ?? response.data;
    final items = rawItems is List
        ? rawItems
              .whereType<Map>()
              .map(
                (item) => Message.fromJson(
                  Map<String, dynamic>.from(item),
                  conversation: conversation,
                ),
              )
              .where((message) => !message.deleted)
              .toList(growable: false)
        : const <Message>[];
    final cursor = MessageCursor.fromJson(
      payload['nextCursor'] ?? payload['next_cursor'],
    );
    final hasMore = payload['hasMore'] == true || payload['has_more'] == true;
    return MessagePage(items: items, nextCursor: cursor, hasMore: hasMore);
  }

  Future<Message> sendMessage(
    ConversationRef conversation,
    String content, {
    String? replyTo,
  }) async {
    final response = await _request(
      () => _dio.post<Object>(
        '/conversations/${conversation.kind.wireName}/${Uri.encodeComponent(conversation.id)}/messages',
        data: {
          'content': content,
          ...?replyTo == null ? null : {'replyTo': replyTo},
        },
      ),
    );
    final payload = _asMap(response.data);
    final messageJson = payload['message'] is Map
        ? payload['message']
        : payload;
    return Message.fromJson(
      Map<String, dynamic>.from(messageJson as Map),
      conversation: conversation,
    );
  }

  Future<Attachment> uploadAttachment(
    ConversationRef conversation,
    PlatformFile file, {
    String? messageId,
    ProgressCallback? onSendProgress,
  }) async {
    final bytes = await file.readAsBytes();
    if (bytes.isEmpty) {
      throw const ApiException(
        'The selected file is not readable on this platform.',
      );
    }
    if (bytes.length > 50 * 1024 * 1024) {
      throw const ApiException('Attachments must be 50 MB or smaller.');
    }
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: file.name),
      'uploader': _session?.user.id ?? '',
      'type': file.extension ?? 'application/octet-stream',
      'size': '${bytes.length}',
      ...?messageId == null ? null : {'message': messageId},
    });
    final response = await _request(
      () => _dio.post<Object>(
        '/attachments',
        queryParameters: {'kind': conversation.kind.wireName},
        data: form,
        onSendProgress: onSendProgress,
      ),
    );
    final payload = _asMap(response.data);
    return Attachment.fromJson(
      payload['attachment'] is Map
          ? Map<String, dynamic>.from(payload['attachment'] as Map)
          : payload,
    );
  }

  Future<Map<String, dynamic>> requestLiveKitToken({
    required String identity,
    required String name,
    required String room,
    String? callId,
  }) async {
    final response = await _request(
      () => _dio.post<Object>(
        '/calls/token',
        data: {
          'identity': identity,
          'name': name,
          'room': room,
          ...?callId == null ? null : {'callId': callId},
        },
      ),
    );
    return _asMap(response.data);
  }

  Future<void> transitionCall(
    String callId,
    String state, {
    ConversationRef? conversation,
    String? room,
  }) async {
    await _request(
      () => _dio.post<void>(
        '/calls/${Uri.encodeComponent(callId)}/transition',
        data: {
          'state': state,
          ...?conversation == null
              ? null
              : {
                  'conversation': {
                    'kind': conversation.kind.wireName,
                    'id': conversation.id,
                  },
                },
          ...?room == null ? null : {'room': room},
        },
      ),
    );
  }

  Future<bool> health() async {
    try {
      final response = await _dio.get<Object>('/health');
      return response.statusCode != null &&
          response.statusCode! >= 200 &&
          response.statusCode! < 300;
    } catch (_) {
      return false;
    }
  }

  Future<void> _setSession(AuthSession session) async {
    _accessToken = session.accessToken;
    // PocketBase 0.22 uses a renewable bearer token rather than issuing a
    // separate OAuth refresh token. Keep an explicit refresh token when the
    // gateway provides one, otherwise reuse the access token for auth-refresh.
    _refreshToken = session.refreshToken ?? session.accessToken;
    _session = session;
    await Future.wait([
      _storage.write(key: _accessTokenKey, value: session.accessToken),
      _storage.write(key: _refreshTokenKey, value: _refreshToken!),
      _storage.write(key: _userKey, value: jsonEncode(session.user.toJson())),
      if (session.expiresAt != null)
        _storage.write(
          key: _expiresAtKey,
          value: session.expiresAt!.toIso8601String(),
        ),
      if (session.expiresAt == null) _storage.delete(key: _expiresAtKey),
    ]);
  }

  Future<Response<T>> _request<T>(
    Future<Response<T>> Function() request, {
    bool retryOnUnauthorized = true,
  }) async {
    try {
      return await request();
    } on DioException catch (error) {
      var failure = error;
      final canRefresh =
          retryOnUnauthorized &&
          failure.response?.statusCode == 401 &&
          _refreshToken?.isNotEmpty == true &&
          !failure.requestOptions.path.contains('/auth/');
      if (canRefresh && await _refreshInternal() != null) {
        try {
          return await request();
        } on DioException catch (retryError) {
          failure = retryError;
        }
      }
      final data = failure.response?.data;
      final serverMessage = data is Map
          ? data['error'] ?? data['message']
          : null;
      throw ApiException(
        serverMessage?.toString() ??
            failure.message ??
            'Network request failed.',
        statusCode: failure.response?.statusCode,
        cause: failure,
      );
    }
  }
}

/// Cross-platform credential store. Native app data is sandboxed by Android,
/// Windows, and Linux; Web uses the browser's origin-scoped storage. Keeping
/// this behind an interface lets a platform keystore implementation replace it
/// without changing the API client or session contract.
class NativeCredentialStore {
  const NativeCredentialStore();

  Future<String?> read({required String key}) async {
    return (await SharedPreferences.getInstance()).getString(key);
  }

  Future<void> write({required String key, required String value}) async {
    await (await SharedPreferences.getInstance()).setString(key, value);
  }

  Future<void> delete({required String key}) async {
    await (await SharedPreferences.getInstance()).remove(key);
  }
}

Map<String, dynamic> _asMap(Object? value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}

List<Map<String, dynamic>> _asList(Object? value) {
  final raw = value is Map
      ? value['items'] ?? value['records'] ?? value['data']
      : value;
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((item) => Map<String, dynamic>.from(item))
      .toList(growable: false);
}
