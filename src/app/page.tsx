import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">MD Viewer</p>
          <h1 className="text-3xl font-semibold tracking-tight">Ready to build.</h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Next.js, TypeScript, Tailwind CSS, and shadcn/ui are set up.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button nativeButton={false} render={<a href="https://ui.shadcn.com/docs" />}>
            shadcn/ui docs
          </Button>
          <Button variant="outline" nativeButton={false} render={<a href="https://nextjs.org/docs" />}>
            Next.js docs
          </Button>
        </div>
      </div>
    </main>
  );
}
