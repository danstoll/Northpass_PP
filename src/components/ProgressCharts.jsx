// Progress Charts and Visual Components for Customer Dashboard

import React from 'react';

// Simple Progress Ring Component
export const ProgressRing = ({ progress, size = 60, strokeWidth = 6, color = '#FF6B35' }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = `${circumference} ${circumference}`;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="progress-ring-svg">
        <circle
          className="progress-ring-background"
          stroke="#e6e6e6"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className="progress-ring-progress"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{
            strokeDasharray,
            strokeDashoffset,
            transition: 'stroke-dashoffset 0.5s ease-in-out',
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%'
          }}
        />
      </svg>
      <div className="progress-ring-text" style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: `${size * 0.2}px`,
        fontWeight: 'bold',
        color: color
      }}>
        {Math.round(progress)}%
      </div>
    </div>
  );
};

// Progress Bar Component
export const ProgressBar = ({ progress, height = 8, color = '#FF6B35', backgroundColor = '#e6e6e6', showText = true }) => {
  return (
    <div className="progress-bar-container">
      <div 
        className="progress-bar-background"
        style={{
          width: '100%',
          height: `${height}px`,
          backgroundColor,
          borderRadius: `${height / 2}px`,
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <div 
          className="progress-bar-fill"
          style={{
            width: `${Math.max(0, Math.min(100, progress))}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: `${height / 2}px`,
            transition: 'width 0.5s ease-in-out'
          }}
        />
      </div>
      {showText && (
        <span className="progress-bar-text" style={{
          fontSize: '12px',
          fontWeight: '500',
          color: '#666',
          marginLeft: '8px'
        }}>
          {Math.round(progress)}%
        </span>
      )}
    </div>
  );
};

// Simple Bar Chart Component
export const SimpleBarChart = ({ data, width = 300, height = 200, color = '#FF6B35' }) => {
  if (!data || data.length === 0) {
    return <div className="chart-empty">No data available</div>;
  }

  const maxValue = Math.max(...data.map(d => d.value));
  const barWidth = (width - 40) / data.length;

  return (
    <div className="simple-bar-chart" style={{ width, height, position: 'relative' }}>
      <svg width={width} height={height} style={{ position: 'absolute' }}>
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * (height - 60);
          const x = 20 + index * barWidth + barWidth * 0.1;
          const y = height - 40 - barHeight;
          
          return (
            <g key={index}>
              <rect
                x={x}
                y={y}
                width={barWidth * 0.8}
                height={barHeight}
                fill={color}
                opacity={0.8}
                rx={2}
              />
              <text
                x={x + (barWidth * 0.4)}
                y={height - 25}
                fontSize="10"
                textAnchor="middle"
                fill="#666"
              >
                {item.label}
              </text>
              <text
                x={x + (barWidth * 0.4)}
                y={y - 5}
                fontSize="12"
                textAnchor="middle"
                fill="#333"
                fontWeight="bold"
              >
                {item.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// Donut Chart Component
export const DonutChart = ({ data, size = 120, innerRadius = 35, colors = ['#FF6B35', '#6B4C9A', '#28a745', '#ffc107'] }) => {
  if (!data || data.length === 0) {
    return <div className="chart-empty">No data available</div>;
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    return <div className="chart-empty">No data available</div>;
  }

  const radius = (size - 20) / 2;
  const center = size / 2;
  
  let currentAngle = 0;
  const segments = data.map((item, index) => {
    const percentage = (item.value / total) * 100;
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    
    // Convert to radians
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    
    // Calculate path
    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);
    
    const largeArcFlag = angle > 180 ? 1 : 0;
    
    const pathData = [
      `M ${center} ${center}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      'Z'
    ].join(' ');
    
    currentAngle += angle;
    
    return {
      ...item,
      pathData,
      color: colors[index % colors.length],
      percentage: Math.round(percentage)
    };
  });

  return (
    <div className="donut-chart" style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size}>
        {segments.map((segment, index) => (
          <path
            key={index}
            d={segment.pathData}
            fill={segment.color}
            opacity={0.8}
            stroke="#fff"
            strokeWidth={2}
          />
        ))}
        {/* Inner circle to create donut effect */}
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill="white"
        />
      </svg>
      
      {/* Legend */}
      <div className="donut-legend" style={{
        position: 'absolute',
        bottom: -40,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        {segments.map((segment, index) => (
          <div key={index} style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: '11px',
            gap: '4px'
          }}>
            <div style={{
              width: '10px',
              height: '10px',
              backgroundColor: segment.color,
              borderRadius: '2px'
            }} />
            <span>{segment.label}: {segment.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Status Badge Component
export const StatusBadge = ({ status, count }) => {
  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'completed': return '#28a745';
      case 'in_progress': case 'in progress': return '#ffc107';
      case 'enrolled': return '#6c757d';
      case 'expired': return '#dc3545';
      case 'expiring': return '#fd7e14';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status) => {
    switch (status.toLowerCase()) {
      case 'completed': return '✅';
      case 'in_progress': case 'in progress': return '⏳';
      case 'enrolled': return '📚';
      case 'expired': return '❌';
      case 'expiring': return '⚠️';
      default: return '📋';
    }
  };

  return (
    <div 
      className="status-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '600',
        backgroundColor: getStatusColor(status),
        color: 'white',
        opacity: 0.9
      }}
    >
      <span>{getStatusIcon(status)}</span>
      <span>{status}</span>
      {count !== undefined && <span>({count})</span>}
    </div>
  );
};