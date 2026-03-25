import "./globals.css";

export const metadata = {
  title: "Court Queue",
  description: "Simple badminton court queue app",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

