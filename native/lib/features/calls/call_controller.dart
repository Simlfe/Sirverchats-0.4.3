import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:livekit_client/livekit_client.dart';

import '../../data/api_client.dart';
import '../../data/realtime_client.dart';
import '../../models/models.dart';

enum CallStatus { idle, ringing, connecting, connected, ended, failed }

class CallController extends ChangeNotifier {
  CallController({required this.api, required this.realtime}) {
    _realtimeSubscription = realtime.events.listen(_onRealtimeEvent);
  }

  final ApiClient api;
  final RealtimeClient realtime;
  Room? _room;
  CallStatus status = CallStatus.idle;
  String? roomName;
  String? callId;
  String? error;
  ConversationRef? conversation;
  ConversationRef? incomingConversation;
  String? incomingCaller;
  bool microphoneEnabled = false;
  bool cameraEnabled = false;
  bool screenShareEnabled = false;
  StreamSubscription<RealtimeEvent>? _realtimeSubscription;

  Room? get room => _room;

  Future<void> join({
    required String room,
    required String identity,
    required String name,
    String? call,
    ConversationRef? forConversation,
    bool withCamera = false,
  }) async {
    if (status == CallStatus.connecting || status == CallStatus.connected) {
      return;
    }
    final acceptingIncoming =
        status == CallStatus.ringing && call != null && callId == call;
    status = CallStatus.connecting;
    error = null;
    roomName = room;
    callId = call ?? 'native-call-${DateTime.now().microsecondsSinceEpoch}';
    conversation = forConversation ?? incomingConversation;
    notifyListeners();
    try {
      final currentUser = api.session?.user;
      realtime.sendCallEvent(
        type: acceptingIncoming ? 'call.accepted' : 'call.ringing',
        data: {
          'callId': callId,
          'room': room,
          'userId': currentUser?.id,
          'name': name,
          if (conversation != null)
            'conversation': {
              'kind': conversation!.kind.wireName,
              'id': conversation!.id,
            },
        },
      );
      try {
        await api.transitionCall(
          callId!,
          acceptingIncoming ? 'accepted' : 'ringing',
          conversation: conversation,
          room: room,
        );
      } catch (_) {
        // Media and ephemeral ringing remain available if an older PocketBase
        // deployment has no calls collection or lifecycle write permission.
      }
      final tokenResponse = await api.requestLiveKitToken(
        identity: identity,
        name: name,
        room: room,
        callId: callId,
      );
      final token =
          (tokenResponse['token'] ??
                  tokenResponse['accessToken'] ??
                  tokenResponse['access_token'])
              ?.toString();
      if (token == null || token.isEmpty) {
        throw const ApiException(
          'The LiveKit token response did not include a token.',
        );
      }
      final nextRoom = Room(
        roomOptions: const RoomOptions(adaptiveStream: true, dynacast: true),
      );
      _room = nextRoom;
      await nextRoom.connect(
        kLiveKitUrl,
        token,
        connectOptions: const ConnectOptions(autoSubscribe: true),
      );
      await nextRoom.localParticipant?.setMicrophoneEnabled(true);
      microphoneEnabled = true;
      if (withCamera) {
        await nextRoom.localParticipant?.setCameraEnabled(true);
        cameraEnabled = true;
      }
      status = CallStatus.connected;
      incomingConversation = null;
      incomingCaller = null;
      notifyListeners();
    } catch (caught) {
      error = caught is ApiException ? caught.message : caught.toString();
      status = CallStatus.failed;
      realtime.sendCallEvent(
        type: 'call.cancelled',
        data: {
          'callId': callId,
          'room': roomName,
          'userId': api.session?.user.id,
          if (conversation != null)
            'conversation': {
              'kind': conversation!.kind.wireName,
              'id': conversation!.id,
            },
        },
      );
      await _disconnectRoom();
      notifyListeners();
    }
  }

  Future<void> toggleMicrophone() async {
    final participant = _room?.localParticipant;
    if (participant == null) return;
    microphoneEnabled = !microphoneEnabled;
    await participant.setMicrophoneEnabled(microphoneEnabled);
    notifyListeners();
  }

  Future<void> toggleCamera() async {
    final participant = _room?.localParticipant;
    if (participant == null) return;
    cameraEnabled = !cameraEnabled;
    await participant.setCameraEnabled(cameraEnabled);
    notifyListeners();
  }

  Future<void> toggleScreenShare() async {
    final participant = _room?.localParticipant;
    if (participant == null) return;
    screenShareEnabled = !screenShareEnabled;
    await participant.setScreenShareEnabled(screenShareEnabled);
    notifyListeners();
  }

  Future<void> leave({String lifecycleState = 'ended'}) async {
    final currentCall = callId;
    await _disconnectRoom();
    status = CallStatus.ended;
    if (currentCall != null) {
      try {
        await api.transitionCall(
          currentCall,
          lifecycleState,
          conversation: conversation ?? incomingConversation,
          room: roomName,
        );
      } catch (_) {
        // The room is already closed; retrying the durable lifecycle update is safe later.
      }
    }
    realtime.sendCallEvent(
      type: 'call.$lifecycleState',
      data: {
        'callId': currentCall,
        'room': roomName,
        'userId': api.session?.user.id,
        if ((conversation ?? incomingConversation) != null)
          'conversation': {
            'kind': (conversation ?? incomingConversation)!.kind.wireName,
            'id': (conversation ?? incomingConversation)!.id,
          },
      },
    );
    conversation = null;
    incomingConversation = null;
    incomingCaller = null;
    notifyListeners();
  }

  Future<void> acceptIncoming() async {
    final incomingRoom = roomName;
    final incomingCall = callId;
    final user = api.session?.user;
    if (incomingRoom == null || incomingCall == null || user == null) return;
    await join(
      room: incomingRoom,
      identity: user.id,
      name: user.label,
      call: incomingCall,
      forConversation: incomingConversation,
    );
  }

  Future<void> declineIncoming() => leave(lifecycleState: 'declined');

  void _onRealtimeEvent(RealtimeEvent event) {
    if (!event.isCall) return;
    final nested = event.data['data'];
    final data = nested is Map ? Map<String, dynamic>.from(nested) : event.data;
    final eventCallId =
        data['callId']?.toString() ?? data['call_id']?.toString();
    final ownId = api.session?.user.id;
    final senderId =
        data['userId']?.toString() ??
        data['user_id']?.toString() ??
        event.data['sender_id']?.toString();
    if (event.type == 'call.ringing' &&
        eventCallId != null &&
        senderId != ownId) {
      final conversationJson = data['conversation'];
      final parsedConversation = conversationJson is Map
          ? ConversationRef(
              kind: conversationJson['kind']?.toString() == 'dm'
                  ? ConversationKind.dm
                  : ConversationKind.channel,
              id: conversationJson['id']?.toString() ?? '',
            )
          : event.conversation;
      status = CallStatus.ringing;
      callId = eventCallId;
      roomName = data['room']?.toString();
      incomingConversation = parsedConversation;
      incomingCaller = data['name']?.toString() ?? senderId;
      notifyListeners();
      return;
    }
    if (eventCallId == null || eventCallId != callId) return;
    if (event.type == 'call.cancelled' ||
        event.type == 'call.declined' ||
        event.type == 'call.ended') {
      unawaited(_disconnectRoom());
      status = CallStatus.ended;
      notifyListeners();
    }
  }

  Future<void> _disconnectRoom() async {
    final room = _room;
    _room = null;
    microphoneEnabled = false;
    cameraEnabled = false;
    screenShareEnabled = false;
    if (room != null) {
      try {
        await room.disconnect();
      } catch (_) {
        // Ignore cleanup failures while transitioning to an ended call.
      }
    }
  }

  @override
  void dispose() {
    _realtimeSubscription?.cancel();
    unawaited(_disconnectRoom());
    super.dispose();
  }
}
