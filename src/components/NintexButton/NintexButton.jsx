import React from 'react';
import './NintexButton.css';

/**
 * Nintex-styled Button Component
 * Follows Nintex brand guidelines with primary orange color
 * 
 * @param {string} variant - 'primary' | 'secondary' | 'tertiary'
 * @param {string} size - 'small' | 'medium' | 'large'
 * @param {function} onClick - Click handler function
 * @param {React.ReactNode} children - Button content
 * @param {boolean} disabled - Disabled state
 * @param {string} className - Additional CSS classes
 * @param {boolean} fullWidth - Make button full width
 * @param {React.ReactNode} leftIcon - Icon to display on the left
 * @param {React.ReactNode} rightIcon - Icon to display on the right
 * @param {boolean} loading - Show loading state
 */
const NintexButton = ({ 
  variant = 'primary', 
  size = 'medium', 
  onClick, 
  children, 
  disabled = false,
  className = '',
  fullWidth = false,
  leftIcon = null,
  rightIcon = null,
  loading = false,
  ...props 
}) => {
  const buttonClasses = [
    'nintex-btn',
    `nintex-btn--${variant}`,
    `nintex-btn--${size}`,
    fullWidth ? 'nintex-btn--full-width' : '',
    loading ? 'nintex-btn--loading' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      className={buttonClasses}
      onClick={onClick}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="nintex-btn__spinner" />}
      {!loading && leftIcon && <span className="nintex-btn__icon nintex-btn__icon--left">{leftIcon}</span>}
      <span className="nintex-btn__content">{children}</span>
      {!loading && rightIcon && <span className="nintex-btn__icon nintex-btn__icon--right">{rightIcon}</span>}
    </button>
  );
};

export default NintexButton;