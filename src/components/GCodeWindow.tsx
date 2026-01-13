import React from 'react';

const GCodeWindow: React.FC = () => {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: 'hsl(240, 14%, 10%)',
      color: '#00ff00',
      fontFamily: 'monospace',
      padding: '10px',
      overflow: 'auto',
      whiteSpace: 'pre'
    }}>
      {`%
O1000 (TEST PROGRAM)
N10 G90 G21 G17
N20 G00 X0 Y0 Z10
N30 M03 S1000
N40 G01 Z-2 F100
N50 X10 Y10
N60 G00 Z10
N70 M05
N80 M30
%`}
    </div>
  );
};

export default GCodeWindow;
