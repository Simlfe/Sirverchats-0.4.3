import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/api_client.dart';
import '../data/local_database.dart';
import '../data/realtime_client.dart';
import '../features/calls/call_controller.dart';
import '../features/chat/chat_controller.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final databaseProvider = Provider<AppDatabase>((ref) {
  final database = AppDatabase();
  ref.onDispose(() => database.close());
  return database;
});

final realtimeClientProvider = Provider<RealtimeClient>((ref) {
  final realtime = RealtimeClient();
  ref.onDispose(realtime.dispose);
  return realtime;
});

final chatControllerProvider = ChangeNotifierProvider<ChatController>((ref) {
  final controller = ChatController(
    api: ref.watch(apiClientProvider),
    database: ref.watch(databaseProvider),
    realtime: ref.watch(realtimeClientProvider),
  );
  ref.onDispose(controller.dispose);
  return controller;
});

final callControllerProvider = ChangeNotifierProvider<CallController>((ref) {
  final controller = CallController(
    api: ref.watch(apiClientProvider),
    realtime: ref.watch(realtimeClientProvider),
  );
  ref.onDispose(controller.dispose);
  return controller;
});
