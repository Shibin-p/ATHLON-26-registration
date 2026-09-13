import React, { useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { Footer } from './Footer';
import { X } from 'lucide-react';

interface AppShellProps {
  children: ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on any navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Prevent background scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Public/Unauthenticated Layout (e.g., /login or /setup)
  if (!isAuthenticated && !loading) {
    return (
      <div className="public-app-container">
        <main className="public-main-content">
          {children}
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="app-layout-wrapper">
      {/* Desktop Left Sidebar */}
      <Sidebar />

      {/* Mobile Drawer (Visible when hamburger clicked on mobile/tablet) */}
      {mobileMenuOpen && (
        <>
          <div
            className="mobile-nav-overlay"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="mobile-drawer-container">
            <button
              className="mobile-drawer-close-btn"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
            >
              <X size={20} />
            </button>
            <Sidebar onNavClick={() => setMobileMenuOpen(false)} />
          </div>
        </>
      )}

      {/* Main Content Area Offset for Desktop Sidebar */}
      <div className="app-main-area">
        <TopHeader
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
          mobileMenuOpen={mobileMenuOpen}
        />
        <main className="main-content">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
};
