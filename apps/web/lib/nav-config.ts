export type NavLink = {
  href: string;
  label: string;
};

export type NavGroup = {
  id: string;
  label: string;
  links: NavLink[];
};

export type NavConfig = {
  primary: NavLink[];
  groups: NavGroup[];
};

export const NAV_CONFIG: NavConfig = {
  primary: [
    { href: "/", label: "Home" },
    { href: "/channels", label: "Channels" },
    { href: "/skills", label: "Skills" },
    { href: "/schedule", label: "Schedule" },
    { href: "/actions", label: "Actions" },
  ],
  groups: [
    {
      id: "operations",
      label: "Operations",
      links: [
        { href: "/channels", label: "Channels" },
        { href: "/skills", label: "Skills" },
        { href: "/schedule", label: "Schedule" },
        { href: "/actions", label: "Actions" },
      ],
    },
    {
      id: "administration",
      label: "Administration",
      links: [{ href: "/admin/skill-config", label: "Skill Config" }],
    },
  ],
};

export default NAV_CONFIG;
