import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Trophy,
  LogOut,
  ShieldCheck,
  Eye,
  CalendarCheck,
  User,
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Users,
  UserCheck,
  BarChart3,
  History,
  Settings,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { NavItem } from '../../types';

export const NAV_ITEMS: NavItem[] = [
  {
    name: 'Dashboard',
    path: '/dashboard',
    iconName: 'LayoutDashboard',
    allowedRoles: ['super_coordinator', 'view_coordinator', 'year_coordinator'],
  },
  {
    name: 'Events',
    path: '/events',
    iconName: 'Calendar',
    allowedRoles: ['super_coordinator', 'view_coordinator', 'year_coordinator'],
  },
  {
    name: 'Registrations',
    path: '/registrations',
    iconName: 'ClipboardList',
    allowedRoles: ['super_coordinator', 'view_coordinator', 'year_coordinator'],
  },
  {
    name: 'Students',
    path: '/students',
    iconName: 'Users',
    allowedRoles: ['super_coordinator', 'year_coordinator'],
  },
  {
    name: 'Coordinators',
    path: '/coordinators',
    iconName: 'UserCheck',
    allowedRoles: ['super_coordinator'],
  },
  {
    name: 'Reports',
    path: '/reports',
    iconName: 'BarChart3',
    allowedRoles: ['super_coordinator', 'view_coordinator', 'year_coordinator'],
  },
  {
    name: 'Activity Log',
    path: '/activity-log',
    iconName: 'History',
    allowedRoles: ['super_coordinator'],
  },
  {
    name: 'Settings',
    path: '/settings',
    iconName: 'Settings',
    allowedRoles: ['super_coordinator'],
  },
];

const renderIcon = (iconName: string) => {
  switch (iconName) {
    case 'LayoutDashboard': return <LayoutDashboard size={15} />;
    case 'Calendar': return <Calendar size={15} />;
    case 'ClipboardList': return <ClipboardList size={15} />;
    case 'Users': return <Users size={15} />;
    case 'UserCheck': return <UserCheck size={15} />;
    case 'BarChart3': return <BarChart3 size={15} />;
    case 'History': return <History size={15} />;
    case 'Settings': return <Settings size={15} />;
    default: return <Trophy size={15} />;
  }
};

export const Navbar: React.FC = () => {
  const {
    user,
    isAuthenticated,
    isSuperCoordinator,
    isYearCoordinator,
    isViewCoordinator,
    logout,
  } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const getRoleBadge = () => {
    if (isSuperCoordinator) {
      return (
        <span className="badge badge-super" title="Full Administrator Access">
          <ShieldCheck size={12} /> SUPER COORDINATOR • All Access
        </span>
      );
    }
    if (isYearCoordinator) {
      return (
        <span className="badge badge-year" title={`Scoped to ${user?.assignedYear}`}>
          <CalendarCheck size={12} /> YEAR COORDINATOR • {user?.assignedYear || 'All Classes'}
        </span>
      );
    }
    if (isViewCoordinator) {
      return (
        <span className="badge badge-view" title="Read-Only All Years">
          <Eye size={12} /> VIEW COORDINATOR • All Years
        </span>
      );
    }
    return null;
  };

  const permittedNavItems = user
    ? NAV_ITEMS.filter((item) => item.allowedRoles.includes(user.role))
    : [];

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <NavLink to="/dashboard" className="brand-wrap">
            <div className="brand-icon">
              <Trophy size={18} />
            </div>
            <div className="brand-text-block">
              <span className="brand-name">ATHLON&apos;26</span>
              <span className="brand-tagline">Annual Sports &amp; Athletics</span>
            </div>
          </NavLink>

          {isAuthenticated && user && (
            <>
              {/* Desktop Nav Links */}
              <div className="nav-links-desktop">
                {permittedNavItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      isActive ? 'nav-item-link active' : 'nav-item-link'
                    }
                  >
                    {renderIcon(item.iconName)}
                    <span>{item.name}</span>
                  </NavLink>
                ))}
              </div>

              {/* Desktop Meta & User Pill */}
              <div className="nav-meta-desktop">
                {getRoleBadge()}

                <div className="nav-user-chip" title={user.email}>
                  <User size={13} />
                  <strong>{user.name}</strong>
                </div>

                <button
                  onClick={() => logout()}
                  className="btn btn-secondary btn-sm"
                  title="Sign Out"
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>

              {/* Mobile Hamburger Toggle */}
              <button
                className="mobile-nav-toggle"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Mobile Drawer Navigation */}
      {isAuthenticated && user && mobileMenuOpen && (
        <>
          <div className="mobile-nav-overlay" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-nav-drawer">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="nav-user-chip" style={{ maxWidth: 'none' }}>
                  <User size={13} />
                  <strong>{user.name}</strong>
                </div>
                {getRoleBadge()}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '8px 0' }}>
              {permittedNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    isActive ? 'mobile-nav-link active' : 'mobile-nav-link'
                  }
                >
                  {renderIcon(item.iconName)}
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                logout();
              }}
              className="btn btn-danger-outline btn-md"
              style={{ width: '100%', marginTop: '8px' }}
            >
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        </>
      )}
    </>
  );
};
