// frontend/app/dashboard/components/StressTestComponent.tsx
'use client';

import React, { useState, useEffect } from 'react';
// Asumimos que DashboardClient es el componente que usa el hook useConversationUI
// import DashboardClient from '../DashboardClient'; 

const DashboardClientMock = () => {
    // const { uiState, startConversation, stopConversation } = useConversationUI({});
    useEffect(() => {
        console.log('Stress Test: DashboardClientMock MOUNTED');
        // startConversation();
        return () => {
            console.log('Stress Test: DashboardClientMock UNMOUNTED');
            // stopConversation(); // el hook ya lo hace, pero esto es explícito
        };
    }, []);
    return <div>Dashboard Mock</div>;
};

/**
 * Componente de testing para verificar la robustez del montaje/desmontaje
 * de componentes que utilizan el motor de conversación.
 */
export const StressTestComponent = () => {
  const [isMounted, setIsMounted] = useState(true);
  const [cycleCount, setCycleCount] = useState(0);

  useEffect(() => {
    console.log(`--- Stress Test Cycle #${cycleCount} ---`);
    const interval = setInterval(() => {
      setIsMounted(prev => !prev);
      if (isMounted) {
          setCycleCount(c => c + 1);
      }
    }, 100); // Montar y desmontar cada 100ms

    // Detener después de 50 ciclos (5 segundos)
    if (cycleCount >= 50) {
      clearInterval(interval);
      console.log('--- Stress Test Completed ---');
    }

    return () => clearInterval(interval);
  }, [isMounted, cycleCount]);

  return (
    <div className="p-4 border-2 border-dashed border-red-500">
      <h3 className="font-bold text-red-600">Stress Test Active</h3>
      <p>Component will mount/unmount rapidly. Check console for leaks.</p>
      {isMounted && <DashboardClientMock />}
    </div>
  );
};
