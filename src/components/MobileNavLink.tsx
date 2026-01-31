import { MouseEventHandler } from "react";

interface MobileNavLinkProps {
  href: string;
  label: string;
  isLast?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export const MobileNavLink: React.FC<MobileNavLinkProps> = ({ href, label, isLast, onClick }) => {
  return (
    <a 
      className={`block p-4 ${!isLast ? 'border-b border-black' : ''}`}
      href={href}
      onClick={onClick}
    >
      {label}
    </a>
  );
};
