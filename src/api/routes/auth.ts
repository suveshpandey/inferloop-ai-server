import { Router, Request, Response } from "express";
import { prisma } from "../../db/client.js";
import { hashPassword, verifyPassword } from "../../auth/password.js";
import { signAccessToken } from "../../auth/jwt.js";
import { issueRefreshToken, findValidRefreshToken, revokeRefreshToken } from "../../auth/refresh.js";
import { requireAuth } from "../../auth/middleware.js";

export const authRouter = Router()


authRouter.post('/signup', async (req: Request, res: Response) => {
    const { email, password, username } = req.body
    
    if (!email || !password) {
        return res.status(400).send({message: "Both Email & Password are required"});
    }

    const existingUser = await prisma.user.findUnique({
        where: {
            email: email
        }
    })

    if (existingUser) { 
        return res.status(409).send({error: "This email is already resistered"});
    }

    const passwordHash = await hashPassword(password);
    
    const newUser = await prisma.user.create({
        data: {
            email: email,
            passwordHash: passwordHash,
            username: username,
        }
    })

    if (newUser) {
        const accessToken = await signAccessToken({sub: newUser.id, email: newUser.email})
        const refreshToken = await issueRefreshToken(newUser.id);

        return res.status(201).json(
            {email: newUser.email, accessToken: accessToken, refreshToken: refreshToken}
        )
    } else {
        return res.status(401).send({message: "User creation failed."})
    }
})


authRouter.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
        return res.status(400).json({ error: "Both Email & Password are required" });
    }

    const user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    const accessToken = await signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = await issueRefreshToken(user.id);

    return res.status(200).json({
        email: user.email,
        accessToken,
        refreshToken
    });
})


authRouter.post('/refresh', async (req: Request, res: Response) => {
    const { refreshToken } = req.body ?? {};

    if (!refreshToken) {
        return res.status(400).json({ error: "refreshToken is required" });
    }

    const userId = await findValidRefreshToken(refreshToken);
    if (!userId) {
        return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return res.status(401).json({ error: "User not found" });
    }

    const accessToken = await signAccessToken({ sub: user.id, email: user.email });

    return res.status(200).json({ accessToken });
})


authRouter.post('/logout', async (req: Request, res: Response) => {
    const { refreshToken } = req.body ?? {};

    if (refreshToken) {
        await revokeRefreshToken(refreshToken);
    }

    return res.status(204).end();
})


authRouter.post('/change-password', requireAuth, async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body ?? {};

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    if (currentPassword === newPassword) {
        return res.status(400).json({ error: "New password must differ from current password" });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    const isValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
    }

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
    });

    return res.status(204).end();
})


authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
            id: true,
            email: true,
            username: true,
            createdAt: true,
        },
    });

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json(user);
})