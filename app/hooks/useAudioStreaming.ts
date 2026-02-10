import { useEffect, useRef, useState, useCallback } from 'react';

export const useAudioStreaming = (url: string | null) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userVolume, setUserVolume] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workerNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>();

  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = context;
      analyserRef.current = context.createAnalyser();
      analyserRef.current.fftSize = 256;
      gainNodeRef.current = context.createGain();
      gainNodeRef.current.connect(context.destination);
    }
    return audioContextRef.current;
  }, []);

  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length > 0 && !currentSourceRef.current) {
      const audioBuffer = audioQueueRef.current.shift();
      if (audioBuffer) {
        const audioContext = getAudioContext();
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(gainNodeRef.current!);
        source.onended = () => {
          currentSourceRef.current = null;
          setIsSpeaking(false);
          playNextAudio();
        };
        source.start(0);
        currentSourceRef.current = source;
        setIsSpeaking(true);
      }
    }
  }, [getAudioContext]);

  const stopAllAIAudio = () => {
    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
      currentSourceRef.current.disconnect();
      currentSourceRef.current = null;
    }
    audioQueueRef.current = [];
    setIsSpeaking(false);
  };

  const measureVolume = useCallback(() => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
      setUserVolume(average);
      animationFrameRef.current = requestAnimationFrame(measureVolume);
    }
  }, []);

  const startStreaming = useCallback(async () => {
    if (isRecording || !url) return;
    
    stopAllAIAudio();

    socketRef.current = new WebSocket(url);
    socketRef.current.onopen = async () => {
      console.log("WebSocket connected. Starting audio stream.");
      const audioContext = getAudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      await audioContext.audioWorklet.addModule('/audio-processor.js');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sourceNodeRef.current = audioContext.createMediaStreamSource(stream);
      
      workerNodeRef.current = new AudioWorkletNode(audioContext, 'audio-processor');
      workerNodeRef.current.port.onmessage = (event) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(event.data);
        }
      };
      
      sourceNodeRef.current.connect(analyserRef.current!);
      analyserRef.current!.connect(workerNodeRef.current);
      workerNodeRef.current.connect(audioContext.destination);
      
      setIsRecording(true);
      animationFrameRef.current = requestAnimationFrame(measureVolume);
    };

    socketRef.current.onerror = (error) => {
      console.error("WebSocket Error:", error);
    };
    
    socketRef.current.onclose = () => {
      console.log("WebSocket disconnected.");
    }
  }, [isRecording, url, getAudioContext, measureVolume]);

  const stopStreaming = useCallback(() => {
    if (!isRecording) return;
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    sourceNodeRef.current?.mediaStream.getTracks().forEach(track => track.stop());
    
    workerNodeRef.current?.port.postMessage('stop'); // Optional: can be used to terminate the worker
    workerNodeRef.current?.disconnect();
    analyserRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();

    socketRef.current?.close();
    
    setUserVolume(0);
    setIsRecording(false);
  }, [isRecording]);

  useEffect(() => {
    if (url && socketRef.current) {
      socketRef.current.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          try {
            const arrayBuffer = await event.data.arrayBuffer();
            const audioBuffer = await getAudioContext().decodeAudioData(arrayBuffer);
            audioQueueRef.current.push(audioBuffer);
            playNextAudio();
          } catch (e) {
            console.error("Error decoding audio data:", e);
          }
        }
      };
    }
  }, [url, getAudioContext, playNextAudio]);

  useEffect(() => {
    if (isRecording) {
      stopAllAIAudio();
    }
  }, [isRecording]);

  useEffect(() => {
    return () => {
      stopStreaming();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [stopStreaming]);

  return { startStreaming, stopStreaming, isRecording, isSpeaking, userVolume };
};
