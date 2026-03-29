import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { registerApiAuthFailureHandler } from "./api/client";
import { router } from "./router";
import { useAuthStore } from "./stores/authStore";
import "./styles.css";

const app = createApp(App);
const pinia = createPinia();

let authRedirectInFlight: Promise<void> | null = null;

registerApiAuthFailureHandler((context) => {
  if (authRedirectInFlight) {
    return authRedirectInFlight;
  }

  const authStore = useAuthStore(pinia);

  authRedirectInFlight = (async () => {
    const currentRoute = router.currentRoute.value;

    if (context.status === 401) {
      authStore.clearSession();
      if (currentRoute.path !== "/login") {
        await router.replace({
          path: "/login",
          query: {
            reason: "session-expired",
            redirect: currentRoute.fullPath,
          },
        });
      }
      return;
    }

    if (context.status === 403 && currentRoute.path !== "/forbidden") {
      await router.replace({
        path: "/forbidden",
        query: {
          from: currentRoute.fullPath,
        },
      });
    }
  })().finally(() => {
    authRedirectInFlight = null;
  });

  return authRedirectInFlight;
});

app.use(pinia);
app.use(router);
app.mount("#app");
