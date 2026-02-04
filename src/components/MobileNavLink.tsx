import { MouseEventHandler } from "react";
import Link from 'next/link';

interface MobileNavLinkProps {
  href: string;
  label: string;
  isLast?: boolean;
  isRoute?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export const MobileNavLink: React.FC<MobileNavLinkProps> = ({ href, label, isLast, isRoute, onClick }) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
  };

  const className = `block p-4 text-sage-800 ${!isLast ? 'border-b border-sage-200' : ''}`;

  return isRoute ? (
    <Link 
      className={className}
      href={href}
      onClick={handleClick}
    >
      {label}
    </Link>
  ) : (
    <a 
      className={className}
      href={href}
      onClick={handleClick}
    >
      {label}
    </a>
  );
};
