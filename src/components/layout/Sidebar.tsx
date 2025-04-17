
import { NavLink } from 'react-router-dom';
import { ReactElement } from 'react';
import { Car } from 'lucide-react';
import { getCurrentUser } from '@/services/authService';

interface NavItem {
  name: string;
  icon: ReactElement;
  path: string;
}

interface SidebarProps {
  navItems: NavItem[];
  onNavClick?: () => void;
}

const Sidebar = ({ navItems, onNavClick }: SidebarProps) => {
  const user = getCurrentUser();

  return (
    <div className="flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-6 border-b">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-drivepulse-blue rounded-md">
            <Car className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-gray-900">DrivePulse</h2>
            <p className="text-xs text-gray-500">Driver Monitoring</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      {user && (
        <div className="p-4 border-b">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-drivepulse-teal text-white font-medium">
                  {user.name.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <div className="font-medium text-sm">{user.name}</div>
              <div className="text-xs text-gray-500">{user.email}</div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <div className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              onClick={onNavClick}
              className={({ isActive }) =>
                `flex items-center px-3 py-2.5 text-sm font-medium rounded-md ${
                  isActive
                    ? 'bg-drivepulse-blue bg-opacity-10 text-drivepulse-blue'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <span className="mr-3">{item.icon}</span>
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Footer */}
      <div className="p-4 border-t mt-auto">
        <div className="text-xs text-gray-500 text-center">
          &copy; {new Date().getFullYear()} DrivePulse
          <br />
          <span className="text-xs">Version 1.0.0</span>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
