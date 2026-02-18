'use client';

import dynamic from 'next/dynamic';
import { EventProvider, TranscriptProvider } from '@classytic/realtime-agents';

// Dynamic import to avoid SSR issues with WebRTC/OpenAI SDK
const DemoContent = dynamic(() => import('./DemoContent'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="text-white text-center">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
        <p>Loading Voice Agent Demo...</p>
      </div>
    </div>
  ),
});

export default function DemoPage() {
  return (
    <EventProvider>
      <TranscriptProvider>
        <DemoContent />
      </TranscriptProvider>
    </EventProvider>
  );
}
