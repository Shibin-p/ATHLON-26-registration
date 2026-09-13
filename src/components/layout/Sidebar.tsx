import React from 'react';
import { NavLink } from 'react-router-dom';
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

export const renderNavIcon = (iconName: string) => {
  switch (iconName) {
    case 'LayoutDashboard': return <LayoutDashboard size={17} />;
    case 'Calendar': return <Calendar size={17} />;
    case 'ClipboardList': return <ClipboardList size={17} />;
    case 'Users': return <Users size={17} />;
    case 'UserCheck': return <UserCheck size={17} />;
    case 'BarChart3': return <BarChart3 size={17} />;
    case 'History': return <History size={17} />;
    case 'Settings': return <Settings size={17} />;
    default: return <Trophy size={17} />;
  }
};

interface SidebarProps {
  onNavClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavClick }) => {
  const {
    user,
    isSuperCoordinator,
    isYearCoordinator,
    isViewCoordinator,
    logout,
  } = useAuth();

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

  const permittedNavItems = user
    ? NAV_ITEMS.filter((item) => item.allowedRoles.includes(user.role))
    : [];

  return (
    <aside className="app-sidebar">
      {/* Top Branding */}
      <div className="sidebar-header">
        <NavLink to="/dashboard" className="brand-wrap" onClick={onNavClick}>
          <div className="brand-icon">
            <Trophy size={19} />
          </div>
          <div className="brand-text-block">
            <span className="brand-name">ATHLON&apos;26</span>
            <span className="brand-tagline">Annual Sports &amp; Athletics</span>
          </div>
        </NavLink>
      </div>

      {/* Navigation Links */}
      <div className="sidebar-nav">
        <div className="sidebar-nav-group-label">NAVIGATION</div>
        <nav className="sidebar-nav-list">
          {permittedNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavClick}
              className={({ isActive }) =>
                isActive ? 'sidebar-nav-item active' : 'sidebar-nav-item'
              }
            >
              <span className="sidebar-nav-icon">{renderNavIcon(item.iconName)}</span>
              <span className="sidebar-nav-label">{item.name}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Sidebar Footer User Area */}
      {user && (
        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <div className="sidebar-user-info">
              <div className="sidebar-user-avatar">
                <User size={15} />
              </div>
              <div className="sidebar-user-details">
                <span className="sidebar-user-name" title={user.name}>{user.name}</span>
                <span className="sidebar-user-role">
                  {isSuperCoordinator && 'Super Coordinator'}
                  {isYearCoordinator && `Year Coord • ${user.assignedYear}`}
                  {isViewCoordinator && 'View Coordinator'}
                </span>
              </div>
            </div>
            <div className="sidebar-badge-wrap">
              {getRoleBadge()}
            </div>
          </div>

          <button
            onClick={() => {
              if (onNavClick) onNavClick();
              logout();
            }}
            className="btn btn-secondary sidebar-logout-btn"
            title="Sign Out of ATHLON'26"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </aside>
  );
};
