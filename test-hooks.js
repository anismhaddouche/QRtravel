const { betterAuth } = require('better-auth');
try {
  const auth = betterAuth({
    database: ":memory:",
    databaseHooks: {
      user: {
        create: {
          before: (user) => {
            console.log("creating user", user);
            return { data: user };
          }
        }
      }
    }
  });
  console.log("Success with databaseHooks");
} catch (e) {
  console.error(e);
}
