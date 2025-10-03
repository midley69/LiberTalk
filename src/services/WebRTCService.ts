import { supabase } from '../lib/supabase';

interface ICEServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice-candidate';
  from_user: string;
  to_user: string;
  session_id: string;
  data: any;
  timestamp: string;
}

export class WebRTCService {
  private static instance: WebRTCService;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentUserId: string | null = null;
  private currentSessionId: string | null = null;
  private signalingChannel: any = null;

  private configuration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ]
  };

  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private onConnectionStateCallback: ((state: RTCPeerConnectionState) => void) | null = null;
  private onICEConnectionStateCallback: ((state: RTCIceConnectionState) => void) | null = null;

  static getInstance(): WebRTCService {
    if (!WebRTCService.instance) {
      WebRTCService.instance = new WebRTCService();
    }
    return WebRTCService.instance;
  }

  async initializeLocalStream(videoEnabled: boolean = true, audioEnabled: boolean = true): Promise<MediaStream> {
    console.log('🎥 Initializing local media stream...', { videoEnabled, audioEnabled });

    try {
      const constraints: MediaStreamConstraints = {
        video: videoEnabled ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: 'user'
        } : false,
        audio: audioEnabled ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('✅ Local stream initialized:', this.localStream.id);

      return this.localStream;
    } catch (error) {
      console.error('❌ Error accessing media devices:', error);
      throw new Error('Impossible d\'accéder à la caméra/micro. Vérifiez les permissions.');
    }
  }

  async createPeerConnection(userId: string, sessionId: string): Promise<void> {
    console.log('🔗 Creating peer connection...', { userId, sessionId });

    this.currentUserId = userId;
    this.currentSessionId = sessionId;

    this.peerConnection = new RTCPeerConnection(this.configuration);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 New ICE candidate:', event.candidate);
        this.sendSignal({
          type: 'ice-candidate',
          from_user: this.currentUserId!,
          to_user: '',
          session_id: this.currentSessionId!,
          data: event.candidate,
          timestamp: new Date().toISOString()
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      console.log('📥 Remote track received:', event.track.kind);

      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }

      this.remoteStream.addTrack(event.track);

      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(this.remoteStream);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('🔌 Connection state changed:', state);

      if (this.onConnectionStateCallback && state) {
        this.onConnectionStateCallback(state);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('🧊 ICE connection state changed:', state);

      if (this.onICEConnectionStateCallback && state) {
        this.onICEConnectionStateCallback(state);
      }
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
        console.log('➕ Added local track:', track.kind);
      });
    }

    await this.setupSignalingChannel(sessionId);
  }

  private async setupSignalingChannel(sessionId: string): Promise<void> {
    console.log('📡 Setting up signaling channel for session:', sessionId);

    this.signalingChannel = supabase
      .channel(`webrtc-${sessionId}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'webrtc_signals',
          filter: `session_id=eq.${sessionId}`
        },
        async (payload) => {
          const signal = payload.new as WebRTCSignal;

          if (signal.to_user === this.currentUserId || signal.to_user === '') {
            await this.handleSignal(signal);
          }
        }
      )
      .subscribe();
  }

  private async handleSignal(signal: WebRTCSignal): Promise<void> {
    console.log('📨 Handling signal:', signal.type);

    try {
      switch (signal.type) {
        case 'offer':
          await this.handleOffer(signal.data);
          break;
        case 'answer':
          await this.handleAnswer(signal.data);
          break;
        case 'ice-candidate':
          await this.handleICECandidate(signal.data);
          break;
      }
    } catch (error) {
      console.error('❌ Error handling signal:', error);
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    console.log('📞 Handling offer...');

    if (!this.peerConnection) {
      console.error('❌ No peer connection');
      return;
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    await this.sendSignal({
      type: 'answer',
      from_user: this.currentUserId!,
      to_user: '',
      session_id: this.currentSessionId!,
      data: answer,
      timestamp: new Date().toISOString()
    });

    console.log('✅ Answer sent');
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    console.log('✅ Handling answer...');

    if (!this.peerConnection) {
      console.error('❌ No peer connection');
      return;
    }

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  private async handleICECandidate(candidate: RTCIceCandidateInit): Promise<void> {
    console.log('🧊 Adding ICE candidate...');

    if (!this.peerConnection) {
      console.error('❌ No peer connection');
      return;
    }

    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private async sendSignal(signal: WebRTCSignal): Promise<void> {
    try {
      const { error } = await supabase
        .from('webrtc_signals')
        .insert(signal);

      if (error) {
        console.error('❌ Error sending signal:', error);
      }
    } catch (error) {
      console.error('❌ Error sending signal:', error);
    }
  }

  async createOffer(): Promise<void> {
    console.log('📞 Creating offer...');

    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    await this.sendSignal({
      type: 'offer',
      from_user: this.currentUserId!,
      to_user: '',
      session_id: this.currentSessionId!,
      data: offer,
      timestamp: new Date().toISOString()
    });

    console.log('✅ Offer sent');
  }

  toggleVideo(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
      console.log(`📹 Video ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  toggleAudio(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
      console.log(`🎤 Audio ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  onRemoteStream(callback: (stream: MediaStream) => void): void {
    this.onRemoteStreamCallback = callback;
  }

  onConnectionState(callback: (state: RTCPeerConnectionState) => void): void {
    this.onConnectionStateCallback = callback;
  }

  onICEConnectionState(callback: (state: RTCIceConnectionState) => void): void {
    this.onICEConnectionStateCallback = callback;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up WebRTC...');

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }

    if (this.signalingChannel) {
      await this.signalingChannel.unsubscribe();
      this.signalingChannel = null;
    }

    this.currentUserId = null;
    this.currentSessionId = null;

    console.log('✅ Cleanup complete');
  }
}

export default WebRTCService;
