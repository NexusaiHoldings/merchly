const channelsNavItem = {
  name: "Channels",
  title: "Channels",
  label: "Channels",
  href: "/channels",
  description: "Manage storefront and marketplace channel connections.",
};

const skillsNavItem = {
  name: "Skills",
  title: "Skills",
  label: "Skills",
  href: "/skills",
  description: "Review and configure autonomous commerce skills.",
};

const scheduleNavItem = {
  name: "Schedule",
  title: "Schedule",
  label: "Schedule",
  href: "/schedule",
  description: "Coordinate cadence execution across connected channels.",
};

const actionsNavItem = {
  name: "Actions",
  title: "Actions",
  label: "Actions",
  href: "/actions",
  description: "Audit the autonomous actions executed across skills.",
};

const skillConfigNavItem = {
  name: "Skill Config",
  title: "Skill Config",
  label: "Skill Config",
  href: "/admin/skill-config",
  description: "Tune skill-level parameters and guardrails.",
};

export const NAV_CONFIG = {
  primary: [
    channelsNavItem,
    skillsNavItem,
    scheduleNavItem,
    actionsNavItem,
    skillConfigNavItem,
  ],
  groups: [
    {
      name: "Operations",
      title: "Operations",
      label: "Operations",
      description: "Daily execution surfaces for the operations team.",
      items: [skillsNavItem, scheduleNavItem, actionsNavItem],
      links: [skillsNavItem, scheduleNavItem, actionsNavItem],
    },
    {
      name: "Administration",
      title: "Administration",
      label: "Administration",
      description: "Configuration surfaces for administrators.",
      items: [channelsNavItem, skillConfigNavItem],
      links: [channelsNavItem, skillConfigNavItem],
    },
  ],
} as const;
