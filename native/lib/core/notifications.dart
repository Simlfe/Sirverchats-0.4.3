import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

typedef NotificationHandler = void Function(RemoteMessage message);

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Background isolates have no widget tree. Initializing Firebase here lets
  // Android deliver an invite even when the app process was suspended.
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // A missing platform Firebase config is expected in local development.
  }
}

class NotificationService {
  NotificationService({NotificationHandler? onMessage}) : _handler = onMessage;

  final NotificationHandler? _handler;
  StreamSubscription<RemoteMessage>? _foregroundSubscription;
  StreamSubscription<RemoteMessage>? _openedSubscription;

  Future<void> initialize() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      _foregroundSubscription = FirebaseMessaging.onMessage.listen(
        _handleMessage,
      );
      _openedSubscription = FirebaseMessaging.onMessageOpenedApp.listen(
        _handleMessage,
      );
    } catch (_) {
      // The native shell remains usable without Firebase configuration.
    }
  }

  Future<String?> getToken() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return null;
    try {
      return await FirebaseMessaging.instance.getToken();
    } catch (_) {
      return null;
    }
  }

  Future<void> dispose() async {
    await _foregroundSubscription?.cancel();
    await _openedSubscription?.cancel();
  }

  void _handleMessage(RemoteMessage message) {
    _handler?.call(message);
  }
}
