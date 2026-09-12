import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:sirver_chats_native/data/api_client.dart';
import 'package:sirver_chats_native/features/auth/login_screen.dart';

void main() {
  testWidgets('renders the native sign-in shell', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: LoginScreen(api: ApiClient(), onSignedIn: (_) {}),
      ),
    );

    expect(find.text('Welcome to SirverChats'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
    expect(find.byType(TextFormField), findsNWidgets(2));
  });
}
