// A static offset-square pattern, strongest at the top and fading downward.
const patternId = "welcome-offset-squares";
export default function WelcomeBackground() {
  return <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden text-muted-foreground opacity-40 [mask-image:linear-gradient(to_bottom,black_8%,transparent_85%)]" aria-hidden="true">
    <svg class="h-full w-full [mask-image:linear-gradient(to_bottom,black_8%,transparent_24%),linear-gradient(to_right,black,transparent_32%,transparent_68%,black)]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={patternId} width="112" height="112" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" stroke-width="1">
            <rect x="8" y="8" width="32" height="32" />
            <rect x="64" y="64" width="32" height="32" />
            <path d="M40 24H72M80 32V64M24 40V72M32 80H64" opacity=".55" />
            <rect x="72" y="16" width="16" height="16" />
            <rect x="16" y="72" width="16" height="16" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  </div>;
}
