"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { basePath } from "@/lib/types";
export function useAppUpdates(
  flush: () => Promise<boolean>,
  notify: (message: string) => void,
) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [applying, setApplying] = useState(false);
  const reloading = useRef(false);
  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    )
      return;
    let closed = false;
    let controlled = !!navigator.serviceWorker.controller;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const stateChanged = () => {
      if (
        !closed &&
        installing?.state === "installed" &&
        navigator.serviceWorker.controller
      )
        setWaiting(registration?.waiting || installing);
    };
    const found = () => {
      installing = registration?.installing || null;
      installing?.addEventListener("statechange", stateChanged);
    };
    const controllerChanged = async () => {
      if (!controlled) {
        controlled = true;
        return;
      }
      if (reloading.current) return;
      reloading.current = true;
      if (await flush()) window.location.reload();
      else {
        reloading.current = false;
        setApplying(false);
        notify(
          "An update is ready. Resolve conflicting edits or download a copy before reloading.",
        );
      }
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      controllerChanged,
    );
    navigator.serviceWorker
      .register(`${basePath}/sw.js`, {
        scope: `${basePath}/`,
        updateViaCache: "none",
      })
      .then((r) => {
        if (closed) return;
        registration = r;
        if (r.waiting && navigator.serviceWorker.controller)
          setWaiting(r.waiting);
        r.addEventListener("updatefound", found);
        if (r.installing) found();
      })
      .catch(() => {
        if (!closed)
          notify(
            "Offline caching could not be prepared. Your documents can still be exported.",
          );
      });
    return () => {
      closed = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        controllerChanged,
      );
      registration?.removeEventListener("updatefound", found);
      installing?.removeEventListener("statechange", stateChanged);
    };
  }, [flush, notify]);
  const apply = useCallback(async () => {
    if (!waiting) return;
    setApplying(true);
    if (!(await flush())) {
      setApplying(false);
      notify("Resolve or download unsaved changes before applying the update.");
      return;
    }
    waiting.postMessage("ACTIVATE_UPDATE");
  }, [waiting, flush, notify]);
  return { available: !!waiting, applying, apply };
}
