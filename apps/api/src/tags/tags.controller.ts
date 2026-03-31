import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TagsService } from './tags.service';
import { SearchTagsDto } from './dto/search-tags.dto';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get('search')
  search(@Query() dto: SearchTagsDto) {
    return this.tagsService.search(dto);
  }

  /** Manually trigger a sync of KOL recommendation tickers into asset_tags. */
  @Post('sync')
  syncTickers() {
    return this.tagsService.syncKolTickers();
  }

  @Get(':ticker')
  findOne(@Param('ticker') ticker: string) {
    return this.tagsService.findOne(ticker);
  }
}
