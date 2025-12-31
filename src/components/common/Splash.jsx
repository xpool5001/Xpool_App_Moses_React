import React, { useEffect } from 'react';
import logo from '../../assets/logo_real.jpg';
import onboardingBottom from '../../assets/onboarding-bottom.png';
import './Splash.css';

const Splash = ({ onFinish }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, 3000); 

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="splash-container">
      <div className="splash-content">
        <div className="logo-wrapper">
          <img src={logo} alt="XPOOL Logo" className="splash-logo" />
        </div>
        <h1 className="app-name">XPOOL</h1>
        <p className="tagline">Where Every Ride Counts</p>
      </div>

      <div className="splash-footer">
        <div className="loading-dots">
          <span></span><span></span><span></span><span></span>
        </div>
        <div className="splash-bottom-image-container">
          <img src={onboardingBottom} alt="City Silhouette" className="splash-bottom-image" />
        </div>
      </div>
    </div>
  );
};

export default Splash;

