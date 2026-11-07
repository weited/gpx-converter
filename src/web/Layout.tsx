import { NavLink, Outlet } from 'react-router';

/** Navigation entries; add a route in main.tsx and a link here to create a new page. */
const NAV = [{ to: '/', label: 'Converter' }];

export function Layout() {
  return (
    <>
      <nav className="topbar">
        <div className="topbar-inner">
          <span className="brand">GPX Tools</span>
          {NAV.length > 1 &&
            NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end className="navlink">
                {item.label}
              </NavLink>
            ))}
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}
