import { Suspense } from "react";
import PlansClient from "./plans-client";

export default function PlansPage() {
  return (
    <Suspense fallback={null}>
      <PlansClient />
    </Suspense>
  );
}
