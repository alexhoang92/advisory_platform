import { Controller, Get, Param, Query } from '@nestjs/common';
import { TagsService } from './tags.service';
import { SearchTagsDto } from './dto/search-tags.dto';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get('search')
  search(@Query() dto: SearchTagsDto) {
    return this.tagsService.search(dto);
  }

  @Get(':ticker')
  findOne(@Param('ticker') ticker: string) {
    return this.tagsService.findOne(ticker);
  }
}
