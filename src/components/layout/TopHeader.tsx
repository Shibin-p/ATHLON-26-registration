import React, { useState, useEffect, useRef } from 'react';
import { useLocation, NavLink } from 'react-router-dom';
import {
  Menu,
  Trophy,
  User,
  ShieldCheck,
  CalendarCheck,
  Eye,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface TopHeaderProps {
  onToggleMobileMenu: () => void;
  mobileMenuOpen: boolean;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  onToggleMobileMenu,
  mobileMenuOpen,
}) => {
  const {
    user,
    isAuthenticated,
    isSuperCoordinator,
    isYearCoordinator,
    isViewCoordinator,
    logout,
  } = useAuth();
  const location = useLocation();

  const [profileOpen, setProfileOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close popover when navigation occurs
  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!profileOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setProfileOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileOpen]);

  // Determine current page context title
  const getContextTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) return 'Dashboard Overview';
    if (path.startsWith('/events')) return 'Events & Competitions';
    if (path.startsWith('/register')) return 'Event Registration';
    if (path.startsWith('/registrations')) return 'Registration Records';
    if (path.startsWith('/students/import')) return 'Import Student Roster';
    if (path.startsWith('/students')) return isYearCoordinator && user?.assignedYear ? `${user.assignedYear} Student Database` : 'Student Master Database';
    if (path.startsWith('/coordinators')) return 'Coordinator Management';
    if (path.startsWith('/reports')) return 'Analytics & Reports';
    if (path.startsWith('/activity-log')) return 'System Activity Audit Log';
    if (path.startsWith('/settings')) return 'Institution & System Settings';
    return "ATHLON'26 Portal";
  };

  const getRoleBadge = (compact: boolean = false) => {
    if (isSuperCoordinator) {
      return (
        <span className="badge badge-super" title="Full Administrator Access" style={compact ? { fontSize: '10px', padding: '3px 8px' } : undefined}>
          <ShieldCheck size={11} /> SUPER COORDINATOR • All Access
        </span>
      );
    }
    if (isYearCoordinator) {
      return (
        <span className="badge badge-year" title={`Scoped to ${user?.assignedYear}`} style={compact ? { fontSize: '10px', padding: '3px 8px' } : undefined}>
          <CalendarCheck size={11} /> YEAR COORDINATOR • {user?.assignedYear || 'All Classes'}
        </span>
      );
    }
    if (isViewCoordinator) {
      return (
        <span className="badge badge-view" title="Read-Only All Years" style={compact ? { fontSize: '10px', padding: '3px 8px' } : undefined}>
          <Eye size={11} /> VIEW COORDINATOR • All Years
        </span>
      );
    }
    return null;
  };

  if (!isAuthenticated || !user) return null;

  return (
    <header className="app-topbar">
      <div className="topbar-inner">
        {/* Left Section: Mobile Menu Button & Context Title */}
        <div className="topbar-left">
          <button
            className="mobile-hamburger-btn"
            onClick={onToggleMobileMenu}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu size={20} />
          </button>

          {/* Mobile Branding (only visible on mobile/tablet) */}
          <NavLink to="/dashboard" className="mobile-brand-wrap">
            <div className="brand-icon" style={{ width: 28, height: 28 }}>
              <Trophy size={15} />
            </div>
            <span className="brand-name" style={{ fontSize: '1.05rem' }}>ATHLON&apos;26</span>
          </NavLink>

          {/* Desktop Context Title */}
          <div className="desktop-context-wrap">
            <span className="desktop-context-title">{getContextTitle()}</span>
          </div>
        </div>

        {/* Right Section: Desktop cluster & Mobile Profile button */}
        <div className="topbar-right">
          {/* Desktop Only Cluster: Badge + User chip + Logout Button */}
          <div className="topbar-desktop-cluster">
            <div className="topbar-badge-desktop">
              {getRoleBadge()}
            </div>

            <div className="nav-user-chip" title={user.email || user.name}>
              <User size={13} />
              <strong>{user.name}</strong>
            </div>

            <button
              onClick={() => logout()}
              className="btn btn-secondary btn-sm topbar-logout-btn"
              title="Sign Out"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>

          {/* Mobile/Tablet Only: Compact Profile Trigger & Animated Dropdown */}
          <div className="topbar-mobile-profile-wrap">
            <button
              ref={triggerRef}
              id="mobile-profile-trigger"
              className={`mobile-profile-btn ${profileOpen ? 'active' : ''}`}
              onClick={() => setProfileOpen(!profileOpen)}
              aria-label="User profile & role menu"
              aria-haspopup="true"
              aria-expanded={profileOpen}
              title={user.name}
            >
              <div className="mobile-profile-avatar">
                <User size={16} />
              </div>
            </button>

            {/* Mobile Animated Profile Popover */}
            {profileOpen && (
              <div
                ref={popoverRef}
                className="mobile-profile-popover"
                role="dialog"
                aria-label="Coordinator details"
              >
                {/* User Info Header */}
                <div className="mobile-profile-card-header">
                  <div className="mobile-profile-card-avatar">
                    <User size={18} />
                  </div>
                  <div className="mobile-profile-card-text">
                    <div className="mobile-profile-card-name">{user.name}</div>
                    <div className="mobile-profile-card-email">{user.email || 'Coordinator'}</div>
                  </div>
                </div>

                {/* Role & Year Section */}
                <div className="mobile-profile-card-badge-wrap">
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {getRoleBadge(true)}
                  </div>
                  {isYearCoordinator && user?.assignedYear && (
                    <div className="mobile-profile-card-year">
                      <span>Assigned Cohort:</span>
                      <strong>{user.assignedYear}</strong>
                    </div>
                  )}
                </div>

                {/* Popover Footer: Sign Out */}
                <div className="mobile-profile-card-actions">
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                    }}
                    className="btn btn-secondary btn-sm mobile-profile-logout-btn"
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
