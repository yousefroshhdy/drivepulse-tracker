
import { NavLink } from 'react-router-dom';
import { ReactElement } from 'react';

interface NavItem {
  name: string;
  icon: ReactElement;
  path: string;
}

interface MobileNavbarProps {
  navItems: NavItem[];
}

const MobileNavbar = ({ navItems }: MobileNavbarProps) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-40">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full ${
                isActive
                  ? 'text-drivepulse-blue'
                  : 'text-gray-500 hover:text-gray-700'
              }`
            }
          >
            {item.icon}
            <span className="text-xs mt-1">{item.name}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default MobileNavbar;
