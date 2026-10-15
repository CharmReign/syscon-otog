export function CreditFooter({ className = '' }) {
  return (
    <p className={`text-center text-sm text-muted-foreground ${className}`}>
      &copy; {new Date().getFullYear()}{' '}
      <a
        href="https://syscon.net/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-teal-500 hover:text-teal-400 hover:underline transition"
      >
        Syscon Justice Systems
      </a>
      . All rights reserved.
    </p>
  );
}
