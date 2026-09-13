import React from 'react';
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

  const getRoleBadge = () => {
    if (isSuperCoordinator) {
      return (
        <span className="badge badge-super" title="Full Administrator Access">
          <ShieldCheck size={11} /> SUPER COORDINATOR • All Access
        </span>
      );
    }
    if (isYearCoordinator) {
      return (
        <span className="badge badge-year" title={`Scoped to ${user?.assignedYear}`}>
          <CalendarCheck size={11} /> YEAR COORDINATOR • {user?.assignedYear || 'All Classes'}
        </span>
      );
    }
    if (isViewCoordinator) {
      return (
        <span className="badge badge-view" title="Read-Only All Years">
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

        {/* Right Section: Role badge, User pill, Sign Out */}
        <div className="topbar-right">
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
      </div>
    </header>
  );
};
