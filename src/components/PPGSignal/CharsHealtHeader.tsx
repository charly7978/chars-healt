
import React, { memo } from 'react';

const CharsHealtHeader: React.FC = memo(() => {
  return (
    <div 
      className="absolute" 
      style={{ 
        top: 'calc(65vh + 5px)', 
        left: 0, 
        right: 0, 
        textAlign: 'center', 
        zIndex: 30 
      }}
    >
      <h1 className="text-xl font-bold">
        <span className="text-white">Chars</span>
        <span className="text-[#ea384c]">Healt</span>
      </h1>
    </div>
  );
});

CharsHealtHeader.displayName = 'CharsHealtHeader';

export default CharsHealtHeader;
