import { useEffect, useState } from 'react';
import './AnimatedSplash.css';

export default function AnimatedSplash({ onComplete }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Auto-hide after 1.5 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        try {
          if (onComplete) onComplete();
        } catch (error) {
          console.error("Splash onComplete error:", error);
        }
      }, 300); // Wait for fade out animation
    }, 1500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={`animated-splash ${!visible ? 'fade-out' : ''}`} aria-hidden={!visible}>
      {/* Animated Background */}
      <div className="splash-bg">
        <div className="splash-grid"></div>
        <div className="splash-gradient splash-gradient-1"></div>
        <div className="splash-gradient splash-gradient-2"></div>
        <div className="splash-gradient splash-gradient-3"></div>
        
        {/* Animated Particles */}
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="splash-particle"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`
            }}
          />
        ))}
      </div>

      {/* Logo Container */}
      <div className="splash-content">
        {/* Rotating Ring */}
        <div className="splash-ring-wrapper">
          <div className="splash-ring splash-ring-1"></div>
          <div className="splash-ring splash-ring-2"></div>
          <div className="splash-ring splash-ring-3"></div>
          
          {/* Logo */}
          <div className="splash-logo-container">
            <img 
              src="/logo.png" 
              alt="LCS Portal" 
              className="splash-logo"
            />
          </div>
        </div>

        {/* School Name */}
        <div className="splash-text">
          <h1 className="splash-title">LCS Portal</h1>
          <p className="splash-subtitle">Loretto Central School</p>
        </div>

        {/* Loading Indicator */}
        <div className="splash-loader">
          <div className="splash-loader-bar"></div>
        </div>
      </div>
    </div>
  );
}
