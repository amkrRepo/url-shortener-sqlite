import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { UrlsModule } from "./urls/urls.module";

@Module({
  imports: [PrismaModule, UrlsModule],
})
export class AppModule {}
