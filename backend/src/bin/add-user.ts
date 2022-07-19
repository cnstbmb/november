import prompt from 'prompt';
import { compose } from '../root';

const { usersController } = compose();

(async () => {
    prompt.start();

    const { login, password } = await prompt.get(['login', 'password']);
    await usersController.createUser(login as string, password as string);
    process.exit();
})();
