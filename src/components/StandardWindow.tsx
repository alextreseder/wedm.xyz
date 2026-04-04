import React from 'react';

interface StandardWindowProps {
  label?: string;
}

const StandardWindow: React.FC<StandardWindowProps> = ({ label }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: 'var(--gl-window-bg, #16161d)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '24px'
    }}>
      {label || 'Window'}
    </div>
  );
};

export default StandardWindow;
