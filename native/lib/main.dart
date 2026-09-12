import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/providers.dart';
import 'core/notifications.dart';
import 'features/auth/login_screen.dart';
import 'features/chat/chat_shell.dart';
import 'models/models.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: SirverChatsApp()));
}

class SirverChatsApp extends ConsumerStatefulWidget {
  const SirverChatsApp({super.key});

  @override
  ConsumerState<SirverChatsApp> createState() => _SirverChatsAppState();
}

class _SirverChatsAppState extends ConsumerState<SirverChatsApp> {
  AuthSession? _session;
  bool _restoring = true;
  bool _darkMode = true;
  late final NotificationService _notifications;

  @override
  void initState() {
    super.initState();
    _notifications = NotificationService();
    unawaited(_restore());
  }

  Future<void> _restore() async {
    final api = ref.read(apiClientProvider);
    final preferences = await SharedPreferences.getInstance();
    final session = await api.restoreSession();
    if (!mounted) return;
    setState(() {
      _darkMode = preferences.getBool('sirver_native_dark_mode') ?? true;
      _session = session;
      _restoring = false;
    });
    await _notifications.initialize();
  }

  void _signedIn(AuthSession session) {
    setState(() => _session = session);
  }

  Future<void> _signOut() async {
    await ref.read(chatControllerProvider).resetSession();
    await ref.read(apiClientProvider).logout();
    await ref.read(realtimeClientProvider).disconnect();
    if (mounted) setState(() => _session = null);
  }

  void _toggleTheme() {
    setState(() => _darkMode = !_darkMode);
    unawaited(
      SharedPreferences.getInstance().then((preferences) {
        return preferences
            .setBool('sirver_native_dark_mode', _darkMode)
            .then((_) {});
      }),
    );
  }

  @override
  void dispose() {
    unawaited(_notifications.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorSeed = const Color(0xFF7BAE37);
    final lightScheme = ColorScheme.fromSeed(
      seedColor: colorSeed,
      brightness: Brightness.light,
    );
    final darkScheme = ColorScheme.fromSeed(
      seedColor: colorSeed,
      brightness: Brightness.dark,
    );
    return MaterialApp(
      title: 'SirverChats',
      debugShowCheckedModeBanner: false,
      themeMode: _darkMode ? ThemeMode.dark : ThemeMode.light,
      theme: _buildTheme(lightScheme),
      darkTheme: _buildTheme(darkScheme),
      home: _restoring
          ? const _SplashScreen()
          : _session == null
          ? LoginScreen(api: ref.read(apiClientProvider), onSignedIn: _signedIn)
          : ChatShell(
              onSignOut: _signOut,
              onToggleTheme: _toggleTheme,
              isDark: _darkMode,
            ),
    );
  }

  ThemeData _buildTheme(ColorScheme scheme) {
    return ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      scaffoldBackgroundColor: scheme.surface,
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHighest.withValues(alpha: .55),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
      ),
      cardTheme: CardThemeData(
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.forum_rounded, size: 64, color: color.primary),
            const SizedBox(height: 14),
            Text(
              'SirverChats',
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 18),
            const SizedBox.square(
              dimension: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ],
        ),
      ),
    );
  }
}
