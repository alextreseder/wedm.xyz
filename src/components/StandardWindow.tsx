import React from 'react';

interface StandardWindowProps {
  label?: string;
}

const StandardWindow: React.FC<StandardWindowProps> = ({ label }) => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: 'hsl(240, 14%, 10%)', // Eigengrau
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
