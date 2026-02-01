import { MouseEventHandler } from "react";

interface MobileNavLinkProps {
  href: string;
  label: string;
  isLast?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export const MobileNavLink: React.FC<MobileNavLinkProps> = ({ href, label, isLast, onClick }) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
  };

  return (
    <a 
      className={`block p-4 text-sage-800 ${!isLast ? 'border-b border-sage-200' : ''}`}
      href={href}
      onClick={handleClick}
    >
      {label}
    </a>
  );
};
