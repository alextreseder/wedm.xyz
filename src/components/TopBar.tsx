import React, { useRef } from 'react';
import { convertStepToGlb } from '../services/occtService';
import { eventBus, EVENTS } from '../utils/eventBus';

/**
 * TopBar Component
 * Renders a thin black bar at the top of the application.
 * Contains action buttons.
 */
const TopBar: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleClearScene = () => {
    eventBus.emit(EVENTS.MODEL_LOADED, null); // Emit null to clear
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      console.log(`Starting import of ${file.name}...`);
      
      // Read file as ArrayBuffer
      const buffer = await file.arrayBuffer();
      
      console.log('Sending to worker for conversion...');
      
      // Convert in worker thread (non-blocking)
      const glbUrl = await convertStepToGlb(buffer);
      
      console.log('Conversion successful, updating scene...');
      eventBus.emit(EVENTS.MODEL_LOADED, glbUrl);
      
      // Reset input to allow selecting same file again
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error('Error processing file:', error);
    }
  };

  return (
    <div style={{
      width: '100%',
      height: '30px',
      backgroundColor: 'black',
      borderBottom: '1px solid #333',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start', // Align items to the start
      paddingLeft: '10px',
      paddingRight: '10px',
      gap: '20px' // Space between title group and button group
    }}>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".stp,.step"
        onChange={handleFileChange}
      />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <a 
          href="https://github.com/alextreseder/wedm.xyz" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{
            color: 'white',
            textDecoration: 'underline',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          WEDM.XYZ
        </a>
        <span style={{ color: '#666', fontSize: '10px' }}>0V01</span>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button 
          style={{
            backgroundColor: '#333',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '3px',
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
          onClick={handleImportClick}
        >
          Import Model
        </button>
        <button 
          style={{
            backgroundColor: '#333',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '3px',
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
          onClick={handleClearScene}
        >
          Clear Scene
        </button>
      </div>
    </div>
  );
};

export default TopBar;
