import { NavLink } from 'react-router-dom'

/**
 * The two halves of the business, and the way between them.
 *
 * Projects and Company are separate views on purpose. They run on different
 * clocks — company costs are steady and monthly, job margins land in lumps when
 * jobs finish — so subtracting one from the other month by month would produce
 * noise. They meet at money in hand, which both of them feed.
 */
export default function DashboardSwitch() {
  return (
    <div className="seg" role="group" aria-label="Switch dashboard">
      <NavLink to="/" end className={({ isActive }) => `seg-btn${isActive ? ' is-active' : ''}`}>
        Projects
      </NavLink>
      <NavLink to="/company" className={({ isActive }) => `seg-btn${isActive ? ' is-active' : ''}`}>
        Company
      </NavLink>
    </div>
  )
}
