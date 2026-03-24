import React from 'react';

const Spaceship = ({ x, y, team, health, isLocal, name }) => {
  const colors = team === 1 ? { primary: '#00ff00', glow: '#00ff00' } : { primary: '#ff4444', glow: '#ff0000' };
  
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Ship body */}
      <polygon
        points="0,-20 -15,15 -5,10 -5,20 0,25 5,20 5,10 15,15"
        fill={colors.primary}
        filter="url(#glow)"
      />
      
      {/* Engine glow */}
      <polygon
        points="-3,20 0,30 3,20"
        fill="#ff6600"
      />
      
      {/* Health bar background */}
      <rect x="-20" y="-35" width="40" height="4" fill="#ff0000" />
      
      {/* Health bar fill */}
      <rect x="-20" y="-35" width={40 * (health / 100)} height="4" fill={colors.primary} />
      
      {/* Name tag */}
      <text x="0" y="-42" textAnchor="middle" fill={health > 50 ? '#00ff00' : '#ff6600'} fontSize="10">
        {name || (isLocal ? 'YOU' : 'Enemy')}
      </text>
      
      {/* Glow filter definition */}
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
          <feMerge>
            <feMergeNode in="offsetblur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </g>
  );
};

export default Spaceship;
